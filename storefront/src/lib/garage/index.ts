import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import { LocalStorageGarage } from "./local-storage-garage"
import { MedusaGarage } from "./medusa-garage"
import { getCustomer } from "@lib/data/customer" // returns the customer or null (NOT "retrieveCustomer")
import { planMerge } from "./merge"

/**
 * Structural surface RoutingGarage needs from its "remote" provider, beyond
 * the shared GarageProvider contract: readiness + load-success + the merge
 * entry point. MedusaGarage satisfies this by construction (default below);
 * tests inject a fake implementing the same surface — this is the seam that
 * makes the customer-identity lifecycle (WB-073 G1/G2) unit-testable without
 * a real MedusaGarage/network.
 */
type RemoteGarage = GarageProvider & {
  ready(): Promise<void>
  isLoaded(): boolean
  mergeFrom(vehicles: Vehicle[]): Promise<boolean>
  // Flags the instance as no longer current — see the identity-change
  // branch of syncAuth() below (WB-073 G5 review Fix 2).
  markSuperseded(): void
}

export class RoutingGarage implements GarageProvider {
  private local = new LocalStorageGarage()
  private remote: RemoteGarage | null = null
  // Customer id the current `remote` was built for (null == no remote / logged
  // out). Comparing against this on every syncAuth — instead of a plain
  // authed boolean — is what makes a login-as-a-different-customer rebuild
  // `remote` from scratch rather than keep showing the previous customer's
  // garage (WB-073 G2).
  private remoteCustomerId: string | null = null
  private current: GarageProvider = this.local
  // Every actively-subscribed listener, paired with its unsubscribe from
  // whichever provider it is CURRENTLY bound to. `subscribe` binds directly
  // to `current` for low overhead; when an auth swap re-points `current`,
  // `setCurrent` walks this map and rebinds each listener onto the new
  // provider so mutations made AFTER the swap still reach components that
  // subscribed BEFORE it (WB-073 G1 — previously they'd go stale, still
  // wired to the abandoned provider).
  private listenerBindings = new Map<() => void, () => void>()
  private merged = false
  // True for the ENTIRE span of an in-flight authed load — from the instant
  // syncAuth() commits to a fresh remote (a customerId just appeared or
  // changed) until that remote's ready() has settled and setCurrent(remote)
  // has run. Exists because `current` deliberately does NOT repoint at the
  // new remote until AFTER ready() (and any merge) settles — see the
  // setCurrent(remote) call sites below, which Task 1/T6 depend on staying
  // exactly where they are — so for that whole window isLoaded()/
  // loadError() reading `this.current` live would still see whatever was
  // current BEFORE this identity change (typically `local`: always
  // ready+empty). That produced a real, unconditional bug on the ordinary
  // authed-page-load path: GarageManager rendered "No vehicles saved yet"
  // for the full getCustomer()+listVehicles() round trip, then flipped to
  // the real state once it arrived — the "loading" branch never rendered
  // (WB-073 G6 review fix). isLoaded()/loadError() below check this flag
  // FIRST, ahead of delegating to `this.current`, so the in-flight window is
  // reported honestly WITHOUT touching the merge/current-switch timing
  // itself. Set (and immediately emitted) only when the change is TO a
  // truthy customerId — a logout needs no loading window (`local` is
  // synchronous) and clears it via the plain else-branch below, on every
  // identity change (not just the first) so a customer->customer swap also
  // reports loading for the INCOMING customer rather than the outgoing
  // one's stale settled state. Left untouched by a superseded syncAuth()'s
  // bailed continuations — every post-await generation check below returns
  // BEFORE reaching a `this.loading = false` write — so a stale generation
  // can never clear a newer generation's in-flight loading state out from
  // under it, the same discipline `generation` already enforces for
  // `remote`/`current`/`merged`.
  private loading = false
  private createRemote: () => RemoteGarage
  // Monotonic counter guarding syncAuth() against itself. syncAuth() is
  // called independently from the constructor AND from GarageAuthSync's
  // mount effect, with no serialization between calls, and has two await
  // points (getCustomer(), remote.ready()) either of which can let a NEWER
  // call race ahead and finish first. Without this guard an older call's
  // continuation can resume after a newer one already rebuilt `remote` for a
  // different identity, and go on to mutate `remote`/`current` (or merge
  // local vehicles into a remote it didn't create) using stale data — a
  // rapid logout-then-login-as-someone-else, or constructor+mount racing on
  // an already-authenticated page load. Every identity-changing continuation
  // captures `gen` up front and re-checks `gen === this.generation` after
  // each await; a mismatch means a later call has already taken over, so the
  // stale one bails without touching any shared state (WB-073 review Fix 1).
  private generation = 0

  constructor(createRemote: () => RemoteGarage = () => new MedusaGarage()) {
    this.createRemote = createRemote
    if (typeof window !== "undefined") void this.syncAuth()
  }

  private emit() { this.listenerBindings.forEach((_off, listener) => listener()) }

  private setCurrent(next: GarageProvider) {
    if (this.current === next) return
    this.current = next
    // tsconfig targets es5 without downlevelIteration, so iterate via
    // forEach rather than for..of (Map isn't spec-iterable at that target).
    // Rebinding an EXISTING key's value mid-forEach is well-defined and does
    // not add or skip entries.
    this.listenerBindings.forEach((off, listener) => {
      off() // unsubscribe from the old provider
      this.listenerBindings.set(listener, next.subscribe(listener)) // rebind onto the new one
    })
  }

  /** Called on boot and after the login/logout Server Actions complete. */
  async syncAuth(): Promise<void> {
    const gen = ++this.generation

    let customerId: string | null
    try {
      const customer = await getCustomer()
      customerId = customer?.id ?? null
    } catch {
      // Transient probe failure (network blip, etc.) — this is NOT new
      // information about who's logged in, so don't act like a logout. The
      // old (pre-WB-073) code preserved `remote` on failure; treating a
      // caught error as `customerId = null` here would trip the
      // identity-changed branch below and NULL an already-loaded account
      // garage, forcing a reload+re-merge (empty-garage flicker) on a mere
      // hiccup. Bail out leaving remote/local/current exactly as they were —
      // a confirmed `null` from a SUCCESSFUL probe below still means logout
      // (WB-073 review Fix 2).
      return
    }

    // A newer syncAuth() call already resolved its own getCustomer() and
    // (possibly) rebuilt `remote` while we were awaiting ours — defer to it
    // rather than acting on now-stale identity info (Fix 1).
    if (gen !== this.generation) return

    // Identity changed (fresh login, logout, or straight to a different
    // account): rebuild `remote` so the new customer never inherits state
    // built for someone else. Logging out nulls it so a later login always
    // gets a fresh instance instead of reusing a stale one.
    if (customerId !== this.remoteCustomerId) {
      // Supersede the OLD remote (if any) before replacing it — an abandoned
      // instance may still have an in-flight write whose rollback fires
      // later; markSuperseded() stops its notifyError() from reaching
      // whoever is on the page after this swap (WB-073 G5 review Fix 2).
      // Mirrors the listener-rebinding setCurrent() does below — same "the
      // old instance stops being able to reach the current UI" property,
      // extended to the error-toast channel, which setCurrent() doesn't
      // touch (it only rebinds subscribe() listeners, not this module-level
      // channel).
      this.remote?.markSuperseded()
      this.remote = customerId ? this.createRemote() : null
      this.remoteCustomerId = customerId
      this.merged = false
      if (customerId != null) {
        // A fresh remote's authed load just kicked off — report loading
        // starting NOW, synchronously with the identity change, not only
        // once remote.ready() eventually resolves (G6 review fix; see the
        // `loading` field comment). Emit immediately so a subscriber
        // transitions into "loading" right away instead of sitting on
        // whatever `current` (still the old provider) reports until this
        // whole syncAuth() call finishes.
        this.loading = true
        this.emit()
      }
    }

    // Capture the remote THIS generation is responsible for. If a later
    // syncAuth() reassigns `this.remote` while we're still awaiting below,
    // we keep operating on (and only ever merge into) the instance we
    // actually built/observed here — never whatever `this.remote` happens to
    // point at by the time our await resolves.
    const remote = this.remote

    if (customerId && remote) {
      await remote.ready()                             // wait for the account to load before merging
      if (gen !== this.generation) return               // superseded while awaiting readiness (Fix 1)

      if (!this.merged && remote.isLoaded()) {
        const { ok, ids } = await this.mergeLocalIntoRemote(remote) // retry on a later syncAuth if the merge failed
        if (gen !== this.generation) return             // superseded mid-merge — don't stomp a newer generation's state (Fix 1)
        // `local.clearOnly(ids)` lives HERE — after the guard — rather than
        // inside mergeLocalIntoRemote, on purpose (Fix 4). mergeFrom()'s own
        // await means a superseded generation's continuation can still
        // resume after a newer generation has taken over; clearing inside
        // the helper cleared unconditionally, before this checkpoint could
        // stop it, so a stale gen's merge could wipe local out from under
        // the current generation (empty-garage flicker via
        // LocalStorageGarage's own direct-to-listeners emit, and a possible
        // double-persist if the superseding generation had already merged
        // off the same not-yet-cleared snapshot). Keeping the clear here —
        // gated by the same `gen === this.generation` check every other
        // post-await mutation already uses — guarantees only the
        // still-current generation ever clears local.
        //
        // `ids` is the client_ids of the FULL PRE-merge local snapshot (every
        // vehicle in local at the instant mergeLocalIntoRemote() started) —
        // not just `toAdd`'s subset (WB-073 G7 review Fix 2). `toAdd`
        // deliberately EXCLUDES any local vehicle whose content (year|make|
        // model|trim) already matches a remote one (see vehiclesToMerge in
        // merge.ts) — those are considered already represented on the
        // account, but they were never actually cleared out of local by a
        // toAdd-only id list, so they'd resurface as zombie duplicates on
        // every future logout (guest re-adds a vehicle already on their
        // account, logs back in: toAdd=[], nothing clears, the duplicate
        // lives in local forever). Clearing the full snapshot instead removes
        // every vehicle that existed at snapshot time — merged or
        // content-duplicate alike, both are safe to drop since both are
        // represented on the remote — while STILL preserving anything added
        // to local AFTER the snapshot (a TOCTOU: `current` is still `local`
        // for this entire mergeFrom() await window — setCurrent(remote) below
        // hasn't run yet — so an "add vehicle" UI action mid-merge lands in
        // local, not remote, and postdates the snapshot so it's absent from
        // `ids`). WB-022's "one idempotent merge request, stable client_ids"
        // contract is unaffected — `mergeFrom()` still only ever sees `toAdd`;
        // only what gets *cleared* afterward changed.
        if (ok) this.local.clearOnly(ids)
        this.merged = ok

        // Drain window-adds (WB-073 G7 review Fix 3): a vehicle added to
        // local during the mergeFrom() await above survives the clearOnly()
        // just above (Fix 2), but it's about to become invisible the instant
        // setCurrent(remote) flips `current` from local to remote a few
        // lines down — from the UI's perspective it "appears then vanishes"
        // until the NEXT syncAuth() tick re-merges it (next login/reload).
        // Drain it into remote right now, still behind the same generation
        // guard as everything else in this block, so it actually syncs
        // instead of just surviving-then-vanishing. Bounded (a small fixed
        // number of rounds) so a steady trickle of adds arriving faster than
        // the network round-trip can't turn this into an unbounded loop —
        // whatever's still left in local after the bound simply survives to
        // the next syncAuth() tick (no data loss, same as the ordinary
        // toAdd-failure retry path already relies on).
        if (ok) {
          const MAX_DRAIN_ROUNDS = 3
          for (let round = 0; round < MAX_DRAIN_ROUNDS && this.local.list().length > 0; round++) {
            const drain = await this.mergeLocalIntoRemote(remote)
            if (gen !== this.generation) return // superseded mid-drain — bail before touching local/current (Fix 1 discipline)
            if (!drain.ok) break // network failure — leave the leftover in local, it retries on the next syncAuth
            this.local.clearOnly(drain.ids)
          }
        }
      }
      this.setCurrent(remote)
      this.loading = false // load settled (success or failure) and `current` now reflects it directly
    } else {
      this.merged = false
      this.setCurrent(this.local)
      this.loading = false // logout (or never-authed): local is synchronous, no loading window needed
    }
    this.emit()
  }

  private async mergeLocalIntoRemote(remote: RemoteGarage): Promise<{ ok: boolean; ids: string[] }> {
    // Snapshot ALL of local — not just what's about to be sent — in the same
    // synchronous tick as the `toAdd` computation below, i.e. still BEFORE
    // the `await remote.mergeFrom(...)` below. This is what lets the caller
    // diff-clear the FULL pre-merge snapshot afterward (WB-073 G7 review Fix
    // 2) instead of only `toAdd`'s subset: `toAdd` excludes local vehicles
    // whose content already matches something on the remote (see
    // vehiclesToMerge in merge.ts) — those are safe to clear too (they're
    // represented on the remote already) but were never being cleared by a
    // toAdd-only id list, so they persisted as zombie duplicates. Capturing
    // the snapshot here, before the await, is exactly what keeps a vehicle
    // added to local DURING the mergeFrom() await out of `ids` — it postdates
    // this read, so it's absent from the snapshot and survives whatever the
    // caller clears afterward.
    const localSnapshot = this.local.list()
    const snapshotIds = localSnapshot.map((v) => v.id)
    const toAdd = planMerge(localSnapshot, remote.list(), remote.isLoaded())
    const ok = await remote.mergeFrom(toAdd) // ONE idempotent request; false on failure (WB-022). Clearing local on
    // success is the caller's (syncAuth's) job, gated behind its post-merge generation guard — see the comment there
    // (Fix 4 / T6). `ids` is the full pre-merge snapshot (Fix 2 above), not just what was sent, so the caller can
    // diff-clear zombie duplicates too instead of a blanket clear.
    return { ok, ids: snapshotIds }
  }

  list() { return this.current.list() }
  add(v: NewVehicle) { return this.current.add(v) }
  update(id: string, patch: Partial<NewVehicle>) { return this.current.update(id, patch) }
  remove(id: string) { return this.current.remove(id) }
  setActive(id: string | null) { return this.current.setActive(id) }
  getActive() { return this.current.getActive() }
  // Load-state signal (WB-073 G6), proxied to whichever provider is
  // CURRENT at call time — never cached — so an identity swap (login,
  // logout, or a straight account-to-account change) is reflected
  // immediately: a freshly-rebuilt `remote` reports not-loaded until its own
  // load() settles, exactly like reading list()/getActive() already does.
  // `?? true`/`?? null` covers `this.local` (LocalStorageGarage implements
  // these directly, so this is currently just defensive) and any future
  // GarageProvider that omits the now-optional signal.
  //
  // `this.loading` is checked FIRST, ahead of `this.current` (WB-073 G6
  // review fix — see the field's comment above): `current` is not
  // repointed at a fresh remote until AFTER its load settles, so during
  // that window delegating straight to `current` would still report
  // whatever the OLD provider said (typically `local`: ready + empty),
  // masking a real in-flight load as an already-empty garage.
  isLoaded(): boolean { return this.loading ? false : (this.current.isLoaded?.() ?? true) }
  loadError(): string | null { return this.loading ? null : (this.current.loadError?.() ?? null) }
  retryLoad(): void { this.current.retryLoad?.() }
  subscribe(l: () => void) {
    this.listenerBindings.set(l, this.current.subscribe(l))
    return () => {
      this.listenerBindings.get(l)?.()
      this.listenerBindings.delete(l)
    }
  }
}

export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
