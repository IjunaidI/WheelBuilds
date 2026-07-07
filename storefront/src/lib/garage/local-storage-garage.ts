import { GarageProvider } from "./provider"
import { NewVehicle, Vehicle } from "./types"

const VEHICLES_KEY = "garage:vehicles"
const ACTIVE_KEY = "garage:active"

const hasWindow = () => typeof window !== "undefined"

const readVehicles = (): Vehicle[] => {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(VEHICLES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Vehicle[]) : []
  } catch {
    return []
  }
}

const writeVehicles = (vehicles: Vehicle[]): void => {
  if (!hasWindow()) return
  window.localStorage.setItem(VEHICLES_KEY, JSON.stringify(vehicles))
}

const readActiveId = (): string | null => {
  if (!hasWindow()) return null
  return window.localStorage.getItem(ACTIVE_KEY)
}

const writeActiveId = (id: string | null): void => {
  if (!hasWindow()) return
  if (id === null) {
    window.localStorage.removeItem(ACTIVE_KEY)
  } else {
    window.localStorage.setItem(ACTIVE_KEY, id)
  }
}

const generateId = (): string => {
  if (hasWindow() && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID()
  }
  return `veh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export class LocalStorageGarage implements GarageProvider {
  private listeners = new Set<() => void>()

  constructor() {
    if (hasWindow()) {
      window.addEventListener("storage", (e) => {
        if (e.key === VEHICLES_KEY || e.key === ACTIVE_KEY) {
          this.emit()
        }
      })
    }
  }

  list(): Vehicle[] {
    return readVehicles()
  }

  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = {
      ...v,
      id: generateId(),
      savedAt: new Date().toISOString(),
    }
    const next = [...readVehicles(), vehicle]
    writeVehicles(next)
    if (readActiveId() === null) {
      writeActiveId(vehicle.id)
    }
    this.emit()
    return vehicle
  }

  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const list = this.list()
    const idx = list.findIndex((v) => v.id === id)
    if (idx === -1) {
      // Mirrors MedusaGarage.update()'s missing-id handling (WB-073 G8
      // review; see medusa-garage.ts for the full race writeup). Reachable
      // here via the same class of benign race, guest-garage flavor:
      // garage-pane.tsx's selectVehicle() re-resolves stale fitment
      // asynchronously, and that row's Remove (×) button is NOT gated during
      // the resolve — the user can delete the vehicle before the resolve
      // settles "ok" and this update() call lands. The old behavior (throwing
      // here) propagated as an unhandled promise rejection out of
      // selectVehicle's fire-and-forget update() call, with no user
      // feedback. No known caller reads update()'s return value on this
      // path; return a Vehicle-shaped placeholder so the (unchanged) return
      // type stays honest without throwing. No write, no emit — a genuine
      // no-op, same as the Medusa-backed provider.
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[garage] update(${id}) skipped — vehicle not found (already removed)`)
      }
      return { id, year: 0, make: "", model: "", savedAt: new Date().toISOString(), ...patch } as Vehicle
    }
    const updated = { ...list[idx], ...patch }
    const next = [...list.slice(0, idx), updated, ...list.slice(idx + 1)]
    writeVehicles(next) // module-level free function (NOT this.writeVehicles) — the same one add()/remove() call
    this.emit()
    return updated
  }

  remove(id: string): void {
    const next = readVehicles().filter((v) => v.id !== id)
    writeVehicles(next)
    if (readActiveId() === id) {
      writeActiveId(next[0]?.id ?? null)
    }
    this.emit()
  }

  setActive(id: string | null): void {
    if (id !== null && !readVehicles().some((v) => v.id === id)) {
      return
    }
    writeActiveId(id)
    this.emit()
  }

  getActive(): Vehicle | null {
    const id = readActiveId()
    if (!id) return null
    return readVehicles().find((v) => v.id === id) ?? null
  }

  // Load-state signal (WB-073 G6). localStorage reads are synchronous, so
  // there's no "loading" window and nothing that can fail the way a network
  // fetch can — always ready, never an error, nothing to retry.
  isLoaded(): boolean { return true }
  loadError(): string | null { return null }
  retryLoad(): void {}

  // Diff-clear (WB-073 G7 / T6): removes only the vehicles whose client_id
  // (== Vehicle.id) is in `clientIds`, leaving everything else untouched.
  // RoutingGarage.syncAuth() uses this instead of a blanket clear() after a
  // successful merge, so a vehicle added to local DURING the in-flight merge
  // request (after the pre-merge snapshot was taken, before this call lands)
  // survives and syncs on a later tick instead of being silently wiped.
  // Mirrors remove()'s active-id fallback: if the active vehicle was one of
  // the ones just merged away, fall back to the first survivor (or null).
  clearOnly(clientIds: string[]): void {
    const ids = new Set(clientIds)
    const next = readVehicles().filter((v) => !ids.has(v.id))
    writeVehicles(next)
    const activeId = readActiveId()
    if (activeId !== null && ids.has(activeId)) {
      writeActiveId(next[0]?.id ?? null)
    }
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }
}
