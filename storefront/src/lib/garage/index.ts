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
        const ok = await this.mergeLocalIntoRemote(remote) // retry on a later syncAuth if the merge failed
        if (gen !== this.generation) return             // superseded mid-merge — don't stomp a newer generation's state (Fix 1)
        // `local.clear()` lives HERE — after the guard — rather than inside
        // mergeLocalIntoRemote, on purpose (Fix 4). mergeFrom()'s own await
        // means a superseded generation's continuation can still resume
        // after a newer generation has taken over; clearing inside the
        // helper cleared unconditionally, before this checkpoint could stop
        // it, so a stale gen's merge could wipe local out from under the
        // current generation (empty-garage flicker via LocalStorageGarage's
        // own direct-to-listeners emit, and a possible double-persist if the
        // superseding generation had already merged off the same
        // not-yet-cleared snapshot). Keeping the clear here — gated by the
        // same `gen === this.generation` check every other post-await
        // mutation already uses — guarantees only the still-current
        // generation ever clears local. (Also the natural spot for a later
        // task, T6/G7, to swap this for a diff-clear of only the merged
        // vehicles instead of a blanket clear.)
        if (ok) this.local.clear()
        this.merged = ok
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

  private async mergeLocalIntoRemote(remote: RemoteGarage): Promise<boolean> {
    const toAdd = planMerge(this.local.list(), remote.list(), remote.isLoaded())
    return remote.mergeFrom(toAdd) // ONE idempotent request; false on failure. Clearing local on success is the
    // caller's (syncAuth's) job, gated behind its post-merge generation guard — see the comment there (Fix 4).
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
