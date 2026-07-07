import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import * as api from "@lib/data/customer-vehicles"

const genId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v_${Math.random().toString(36).slice(2)}`

// --- Write-failure error channel (WB-073 G5) --------------------------
// A tiny module-level pub/sub so a thin React layer (use-garage.ts) can turn
// a failed network write into a toast without this file importing a UI
// toast library — keeps MedusaGarage unit-testable in plain Node/vitest
// (no DOM/sonner dependency) while still giving the storefront a seam to
// show one. Module-level rather than per-instance: RoutingGarage can swap
// which MedusaGarage instance is "current" mid-flight (e.g. a logout races
// an in-flight write), but a failure from ANY instance is still real
// feedback the user should see.
type GarageErrorListener = (message: string) => void
const errorListeners = new Set<GarageErrorListener>()
const DEFAULT_FAILURE_MESSAGE = "Couldn't save your garage change — please try again."
/** Subscribe to garage write-failure notifications. Returns an unsubscribe fn. */
export function onGarageError(listener: GarageErrorListener): () => void {
  errorListeners.add(listener)
  return () => { errorListeners.delete(listener) }
}
function notifyError(message: string = DEFAULT_FAILURE_MESSAGE) {
  errorListeners.forEach((l) => l(message))
}

function toWire(v: Vehicle) {
  return { client_id: v.id, year: v.year, make: v.make, model: v.model, trim: v.trim,
    modificationSlug: v.modificationSlug, canonicalBoltPatterns: v.canonicalBoltPatterns,
    hubBoreMm: v.hubBoreMm, diameterWindow: v.diameterWindow, widthWindow: v.widthWindow,
    offsetWindow: v.offsetWindow, oemTireSizes: v.oemTireSizes, oemTires: v.oemTires, fitmentStatus: v.fitmentStatus,
    notes: v.notes, is_active: false }
}
function fromWire(r: any): Vehicle {
  return { id: r.client_id ?? r.id, year: r.year, make: r.make, model: r.model, trim: r.trim ?? undefined,
    modificationSlug: r.modification_slug ?? undefined, canonicalBoltPatterns: r.canonical_bolt_patterns ?? undefined,
    hubBoreMm: r.hub_bore_mm_x100 == null ? undefined : r.hub_bore_mm_x100 / 100, diameterWindow: r.diameter_window ?? undefined,
    widthWindow: r.width_window ?? undefined, offsetWindow: r.offset_window ?? undefined,
    oemTireSizes: r.oem_tire_sizes ?? undefined,
    oemTires: r.oem_tires ?? undefined,
    fitmentStatus: r.fitment_status ?? undefined, notes: r.notes ?? undefined, savedAt: r.created_at ?? new Date().toISOString() }
}

export class MedusaGarage implements GarageProvider {
  private vehicles: Vehicle[] = []
  private activeId: string | null = null
  private listeners = new Set<() => void>()
  private loaded: Promise<void>
  private loadOk = false
  // Non-null exactly when the most recent load() attempt failed (WB-073
  // G6). Distinct from loadOk being false, which is ALSO true while the
  // first load is still in flight — this is what lets a consumer tell
  // "loading" and "failed" apart (both otherwise look like isLoaded()===
  // false with an empty vehicles array, i.e. indistinguishable from a
  // genuinely-empty garage).
  private loadErrorMessage: string | null = null
  // Tracks the in-flight createVehicle() network call for a vehicle added
  // THIS session, keyed by client_id. activateVehicle()/update() are fired
  // right after add() (often in the same tick — see ymm-pane.tsx), so
  // without this they raced the server and could 404 against a vehicle it
  // hadn't created yet (WB-073 G3). Callers stay fire-and-forget; only the
  // underlying network calls get sequenced. Settles to undefined either way
  // (success or failure) — this only guarantees ORDER; a failed create is
  // now ALSO surfaced (rolled back + toasted) via failedCreateIds below
  // (WB-073 G5). Absent for any id not added this session (e.g. loaded from
  // the account), so those calls fire immediately as before.
  private pendingCreate = new Map<string, Promise<void>>()
  // ids whose createVehicle() rejected THIS session (WB-073 G5). Once a
  // create fails, add() has already rolled the vehicle out of local state
  // and toasted — so update()/setActive() queued behind the same
  // pendingCreate entry must skip their own network call rather than firing
  // against a vehicle that never reached the server (and rolling back +
  // toasting a SECOND time for the same root failure). Never populated for
  // vehicles not created this session, so the "existing account vehicle"
  // path is unaffected. Not cleaned up — bounded by failed adds per
  // session, same lifetime tradeoff as the rest of this in-memory instance.
  private failedCreateIds = new Set<string>()
  // False once RoutingGarage supersedes this instance — i.e. it rebuilds
  // `remote` for a different identity (login/logout/account-switch) while
  // this instance still has an in-flight write (WB-073 G5 review Fix 2).
  // Gates notify() below: RoutingGarage stops READING from a superseded
  // instance (setCurrent() re-points `current`/listeners elsewhere), but the
  // module-level onGarageError() channel this instance's rollbacks call into
  // is NOT scoped by construction — without this flag, an abandoned
  // instance's late-settling rollback would still toast "couldn't save your
  // garage change" at whoever is on the page NOW, crossing the identity
  // boundary G1/G2 exist to close. Checked at NOTIFY time (not call-
  // initiation time), so it covers writes that were already in flight when
  // the swap happened, not just ones started after.
  private superseded = false

  constructor() {
    this.loaded = typeof window !== "undefined" ? this.load() : Promise.resolve()
  }

  /** Resolves once the initial account load has settled (success or failure). */
  ready(): Promise<void> { return this.loaded }
  /** True only if the initial account load actually succeeded. False both while loading and after a failed load — pair with loadError() to tell those apart (WB-073 G6). */
  isLoaded(): boolean { return this.loadOk }
  /** Non-null exactly when the most recent load attempt failed; null while loading or after a successful load (WB-073 G6). */
  loadError(): string | null { return this.loadErrorMessage }
  /**
   * Re-attempts a failed initial load — the GarageManager "Retry" affordance
   * (WB-073 G6). Clears the error and emits IMMEDIATELY (synchronously, before
   * the new network call even starts) so a subscriber transitions straight
   * back to the "loading" state rather than lingering on the stale error
   * while the retry is in flight. `this.loaded` is repointed at the new
   * attempt so ready() (used by RoutingGarage.syncAuth()) reflects it too.
   */
  retryLoad(): void {
    this.loadErrorMessage = null
    this.emit()
    this.loaded = this.load()
  }
  /**
   * Called by RoutingGarage right before this instance stops being the
   * current remote (identity-change branch of syncAuth()). Idempotent, and
   * one-way — an instance can't become current again once replaced;
   * RoutingGarage always builds a fresh one (WB-073 G5 review Fix 2).
   */
  markSuperseded(): void { this.superseded = true }

  private emit() { this.listeners.forEach((l) => l()) }
  /**
   * Routes a write-failure through the module-level onGarageError() channel
   * — UNLESS this instance has been superseded (WB-073 G5 review Fix 2; see
   * the `superseded` field comment above). All 4 rollback paths call this
   * instead of the bare notifyError() so an abandoned instance never toasts
   * into whoever is on the page now.
   */
  private notify(message: string = DEFAULT_FAILURE_MESSAGE): void {
    if (!this.superseded) notifyError(message)
  }
  private async load() {
    try {
      const { vehicles } = await api.listVehicles()
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.loadOk = true
      this.loadErrorMessage = null
      this.emit()
    } catch {
      // Stay empty on failure — but (WB-073 G6) record it AND emit so
      // subscribers (useGarage -> GarageManager) re-render into an explicit
      // error state instead of silently sitting on the pre-load empty
      // snapshot, which read identically to a genuinely-empty garage. The
      // write-failure toast channel (onGarageError) is a separate concern
      // for MUTATIONS; a failed READ has no optimistic state to roll back,
      // so it gets its own signal here rather than routing through notify().
      this.loadOk = false
      this.loadErrorMessage = "Couldn't load your garage — please try again."
      this.emit()
    }
  }

  list(): Vehicle[] { return this.vehicles }
  getActive(): Vehicle | null { return this.vehicles.find((v) => v.id === this.activeId) ?? null }

  /**
   * Merge a batch of local vehicles into the account in ONE request. Uses each
   * vehicle's stable local id as client_id (idempotent across retries: a retry
   * sends the same (customer_id, client_id) so the backend guard absorbs
   * already-written rows instead of duplicating them). Returns false (leaving
   * state untouched) on failure so the caller keeps the local garage and retries
   * on the next auth sync. Empty input → true.
   */
  async mergeFrom(vehicles: Vehicle[]): Promise<boolean> {
    if (!vehicles.length) return true
    const wire = vehicles.map(toWire) // client_id = vehicle.id (stable across retries → idempotent)
    try {
      const { vehicles: merged } = await api.mergeVehicles(wire)
      this.vehicles = merged.map(fromWire)
      const active = merged.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.emit()
      return true
    } catch {
      return false
    }
  }

  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = { ...v, id: genId(), savedAt: new Date().toISOString() }
    this.vehicles = [...this.vehicles, vehicle]
    if (this.activeId == null) this.activeId = vehicle.id // mirror LocalStorageGarage auto-active
    this.emit()
    // .then(ok, err) rather than .catch() so the settled type is always
    // Promise<void> — downstream awaiters (update/setActive) only care that
    // the network call has settled, not what it resolved to; a failed
    // create still unblocks them (WB-073 G3 ordering preserved). The
    // failure itself is now surfaced here: mark it, roll back the
    // optimistic add, and notify (WB-073 G5).
    const created: Promise<void> = api.createVehicle(toWire(vehicle)).then(
      () => undefined,
      () => {
        this.failedCreateIds.add(vehicle.id)
        // Only toast if there was actually something to undo — if the user
        // already removed this vehicle themselves before the create
        // settled, rollbackMissing is a no-op and a toast would just be
        // confusing noise about a change they don't perceive as pending.
        if (this.rollbackMissing(vehicle.id)) this.notify()
      }
    )
    this.pendingCreate.set(vehicle.id, created)
    void created.finally(() => {
      // Only clear our own entry — a later add() reusing this id (can't
      // happen with genId(), but keep the map consistent regardless).
      if (this.pendingCreate.get(vehicle.id) === created) this.pendingCreate.delete(vehicle.id)
    })
    return vehicle
  }
  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    if (idx === -1) {
      // Target vehicle isn't present locally — most likely its
      // createVehicle() already rejected and add()'s rollback removed it
      // (WB-073 G5 review Fix 1: ymm-pane.tsx's submit() calls add() ->
      // setActive() -> awaits the fitment lookup -> update(vehicle.id, ...);
      // a create rejecting during that await is a real, reachable sequence,
      // not theoretical), or the user removed it themselves before this
      // call landed. Either way the failure (if any) was already surfaced
      // by that path's own rollback + toast, so a missing update target is
      // an expected benign race in an optimistic garage — NOT a new error.
      // The old behavior (throwing here) propagated synchronously out of an
      // awaited caller with no catch (ymm-pane's submit() try/finally),
      // aborting the rest of submit (onClose/router.push) and hanging the
      // drawer. No known caller reads update()'s return value on this path;
      // return a Vehicle-shaped placeholder so the (unchanged) return type
      // stays honest without throwing.
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[garage] update(${id}) skipped — vehicle not present (already rolled back or removed)`)
      }
      return { id, year: 0, make: "", model: "", savedAt: new Date().toISOString(), ...patch } as Vehicle
    }
    const previous = this.vehicles[idx]
    const updated = { ...previous, ...patch }
    this.vehicles = [...this.vehicles.slice(0, idx), updated, ...this.vehicles.slice(idx + 1)]
    this.emit()
    const createdFirst = this.pendingCreate.get(id) ?? Promise.resolve()
    void createdFirst
      .then(() => {
        // The create this update was queued behind already failed — add()
        // has rolled the vehicle back and toasted. Don't fire a write for a
        // vehicle that never reached the server, and don't toast twice.
        if (this.failedCreateIds.has(id)) return undefined
        return api.updateVehicle(id, { modificationSlug: updated.modificationSlug, canonicalBoltPatterns: updated.canonicalBoltPatterns,
          hubBoreMm: updated.hubBoreMm, diameterWindow: updated.diameterWindow, widthWindow: updated.widthWindow,
          offsetWindow: updated.offsetWindow, oemTireSizes: updated.oemTireSizes, oemTires: updated.oemTires, fitmentStatus: updated.fitmentStatus, trim: updated.trim, notes: updated.notes } as any)
      })
      .catch(() => {
        if (this.rollbackUpdate(id, previous)) this.notify()
      })
    return updated
  }
  remove(id: string): void {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    const previous = idx === -1 ? undefined : this.vehicles[idx]
    const wasActive = this.activeId === id
    this.vehicles = this.vehicles.filter((v) => v.id !== id)
    if (wasActive) this.activeId = this.vehicles[0]?.id ?? null
    this.emit()
    void api.deleteVehicle(id).catch(() => {
      if (!previous) return // wasn't present locally to begin with — nothing to restore
      this.rollbackRemove(previous, idx, wasActive)
      this.notify()
    })
  }
  setActive(id: string | null): void {
    if (id !== null && this.failedCreateIds.has(id)) {
      // Same benign-race guard as update() above, for symmetry (WB-073 G5
      // review Fix 1) — this vehicle's create already failed and was rolled
      // back + toasted. Don't optimistically point activeId at a vehicle
      // that no longer exists in this.vehicles (getActive() would just
      // return null anyway) or schedule a network-call chain the inner
      // failedCreateIds check below would only skip after an extra
      // microtask hop.
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[garage] setActive(${id}) skipped — vehicle not present (already rolled back)`)
      }
      return
    }
    const previous = this.activeId
    this.activeId = id
    this.emit()
    if (id) {
      const createdFirst = this.pendingCreate.get(id) ?? Promise.resolve()
      void createdFirst
        .then(() => {
          // Same guard as update() — a vehicle whose create failed was
          // already rolled back; don't try to activate it server-side.
          if (this.failedCreateIds.has(id)) return undefined
          return api.activateVehicle(id)
        })
        .catch(() => {
          if (this.activeId === id) { this.activeId = previous; this.emit() }
          this.notify()
        })
    }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  /**
   * Removes `id` from local state if still present, falling back the active
   * vehicle to the next one remaining (same rule the happy-path remove()
   * uses). Shared by the create-failure rollback (add) and the user-facing
   * remove()-failure rollback below — both mean "this vehicle doesn't exist,
   * undo whatever pointed at it." No-ops if `id` is already gone (e.g. the
   * user removed it themselves before the network call settled) so rollback
   * stays idempotent instead of re-emitting a no-op change (WB-022).
   */
  private rollbackMissing(id: string): boolean {
    if (!this.vehicles.some((v) => v.id === id)) return false
    this.vehicles = this.vehicles.filter((v) => v.id !== id)
    if (this.activeId === id) this.activeId = this.vehicles[0]?.id ?? null
    this.emit()
    return true
  }
  /** Reverts vehicle `id` back to `previous` if it's still present; no-op (returns false) if it was removed since (e.g. rolled back by a failed create). */
  private rollbackUpdate(id: string, previous: Vehicle): boolean {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    if (idx === -1) return false
    this.vehicles = [...this.vehicles.slice(0, idx), previous, ...this.vehicles.slice(idx + 1)]
    this.emit()
    return true
  }
  /**
   * Re-inserts a vehicle removed by remove() once its deleteVehicle() call
   * fails, restoring it as active if it was before the removal — AT its
   * original index rather than appended to the end, so a failed removal
   * doesn't silently reorder the garage (WB-073 G5 review Fix 3). `index` is
   * clamped to the current length in case the list has shrunk further since
   * (e.g. another vehicle removed concurrently) — best-effort position, not
   * a guarantee under concurrent mutation.
   */
  private rollbackRemove(vehicle: Vehicle, index: number, wasActive: boolean) {
    if (this.vehicles.some((v) => v.id === vehicle.id)) return // re-added since (fresh uuid makes this unlikely, but stay idempotent)
    const insertAt = Math.min(Math.max(index, 0), this.vehicles.length)
    this.vehicles = [...this.vehicles.slice(0, insertAt), vehicle, ...this.vehicles.slice(insertAt)]
    if (wasActive) this.activeId = vehicle.id
    this.emit()
  }
}
