import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import * as api from "@lib/data/customer-vehicles"

const genId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v_${Math.random().toString(36).slice(2)}`

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
  // Tracks the in-flight createVehicle() network call for a vehicle added
  // THIS session, keyed by client_id. activateVehicle()/update() are fired
  // right after add() (often in the same tick — see ymm-pane.tsx), so
  // without this they raced the server and could 404 against a vehicle it
  // hadn't created yet (WB-073 G3). Callers stay fire-and-forget; only the
  // underlying network calls get sequenced. Settles to undefined either way
  // (success or failure) — this only guarantees ORDER, each network call
  // still swallows its own failure independently, same as before. Absent
  // for any id not added this session (e.g. loaded from the account), so
  // those calls fire immediately as before.
  private pendingCreate = new Map<string, Promise<void>>()

  constructor() {
    this.loaded = typeof window !== "undefined" ? this.load() : Promise.resolve()
  }

  /** Resolves once the initial account load has settled (success or failure). */
  ready(): Promise<void> { return this.loaded }
  /** True only if the initial account load actually succeeded. */
  isLoaded(): boolean { return this.loadOk }

  private emit() { this.listeners.forEach((l) => l()) }
  private async load() {
    try {
      const { vehicles } = await api.listVehicles()
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.loadOk = true
      this.emit()
    } catch { this.loadOk = false /* stay empty on failure; toast handled by callers */ }
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
    // Promise<void> — downstream awaiters only care that the network call
    // has settled, not what it resolved to.
    const created: Promise<void> = api.createVehicle(toWire(vehicle)).then(
      () => undefined,
      () => {/* retry/toast */}
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
    if (idx === -1) throw new Error(`vehicle ${id} not found`)
    const updated = { ...this.vehicles[idx], ...patch }
    this.vehicles = [...this.vehicles.slice(0, idx), updated, ...this.vehicles.slice(idx + 1)]
    this.emit()
    const createdFirst = this.pendingCreate.get(id) ?? Promise.resolve()
    void createdFirst
      .then(() =>
        api.updateVehicle(id, { modificationSlug: updated.modificationSlug, canonicalBoltPatterns: updated.canonicalBoltPatterns,
          hubBoreMm: updated.hubBoreMm, diameterWindow: updated.diameterWindow, widthWindow: updated.widthWindow,
          offsetWindow: updated.offsetWindow, oemTireSizes: updated.oemTireSizes, oemTires: updated.oemTires, fitmentStatus: updated.fitmentStatus, trim: updated.trim, notes: updated.notes } as any)
      )
      .catch(() => {})
    return updated
  }
  remove(id: string): void {
    this.vehicles = this.vehicles.filter((v) => v.id !== id)
    if (this.activeId === id) this.activeId = this.vehicles[0]?.id ?? null
    this.emit()
    void api.deleteVehicle(id).catch(() => {})
  }
  setActive(id: string | null): void {
    this.activeId = id
    this.emit()
    if (id) {
      const createdFirst = this.pendingCreate.get(id) ?? Promise.resolve()
      void createdFirst.then(() => api.activateVehicle(id)).catch(() => {})
    }
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}
