import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import * as api from "@lib/data/customer-vehicles"

const genId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `v_${Math.random().toString(36).slice(2)}`

function toWire(v: Vehicle) {
  return { client_id: v.id, year: v.year, make: v.make, model: v.model, trim: v.trim,
    modificationSlug: v.modificationSlug, canonicalBoltPatterns: v.canonicalBoltPatterns,
    hubBoreMm: v.hubBoreMm, diameterWindow: v.diameterWindow, widthWindow: v.widthWindow,
    offsetWindow: v.offsetWindow, fitmentStatus: v.fitmentStatus, notes: v.notes, is_active: false }
}
function fromWire(r: any): Vehicle {
  return { id: r.client_id ?? r.id, year: r.year, make: r.make, model: r.model, trim: r.trim ?? undefined,
    modificationSlug: r.modification_slug ?? undefined, canonicalBoltPatterns: r.canonical_bolt_patterns ?? undefined,
    hubBoreMm: r.hub_bore_mm ?? undefined, diameterWindow: r.diameter_window ?? undefined,
    widthWindow: r.width_window ?? undefined, offsetWindow: r.offset_window ?? undefined,
    fitmentStatus: r.fitment_status ?? undefined, notes: r.notes ?? undefined, savedAt: r.created_at ?? new Date().toISOString() }
}

export class MedusaGarage implements GarageProvider {
  private vehicles: Vehicle[] = []
  private activeId: string | null = null
  private listeners = new Set<() => void>()

  constructor() { if (typeof window !== "undefined") void this.load() }

  private emit() { this.listeners.forEach((l) => l()) }
  private async load() {
    try {
      const { vehicles } = await api.listVehicles()
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.emit()
    } catch { /* stay empty on failure; toast handled by callers */ }
  }

  list(): Vehicle[] { return this.vehicles }
  getActive(): Vehicle | null { return this.vehicles.find((v) => v.id === this.activeId) ?? null }

  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = { ...v, id: genId(), savedAt: new Date().toISOString() }
    this.vehicles = [...this.vehicles, vehicle]
    if (this.activeId == null) this.activeId = vehicle.id // mirror LocalStorageGarage auto-active
    this.emit()
    void api.createVehicle(toWire(vehicle)).catch(() => {/* retry/toast */})
    return vehicle
  }
  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    if (idx === -1) throw new Error(`vehicle ${id} not found`)
    const updated = { ...this.vehicles[idx], ...patch }
    this.vehicles = [...this.vehicles.slice(0, idx), updated, ...this.vehicles.slice(idx + 1)]
    this.emit()
    void api.updateVehicle(id, { modificationSlug: updated.modificationSlug, canonicalBoltPatterns: updated.canonicalBoltPatterns,
      hubBoreMm: updated.hubBoreMm, diameterWindow: updated.diameterWindow, widthWindow: updated.widthWindow,
      offsetWindow: updated.offsetWindow, fitmentStatus: updated.fitmentStatus, trim: updated.trim, notes: updated.notes } as any).catch(() => {})
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
    if (id) void api.activateVehicle(id).catch(() => {})
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}
