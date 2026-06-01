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
    if (idx === -1) throw new Error(`vehicle ${id} not found`)
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
