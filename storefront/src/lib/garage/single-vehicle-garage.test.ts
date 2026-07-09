import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { SingleVehicleGarage } from "./single-vehicle-garage"
import { LocalStorageGarage } from "./local-storage-garage"
import type { NewVehicle } from "./types"

/**
 * Vitest runs with `environment: "node"` (see vitest.config.ts) — install the
 * same minimal in-memory window/localStorage fake local-storage-garage.test.ts
 * uses so persistence calls actually persist.
 */
function installFakeWindow(): { uninstall: () => void } {
  const store = new Map<string, string>()
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    },
    crypto: { randomUUID: () => `id_${store.size}_${Math.random().toString(36).slice(2, 10)}` },
    addEventListener: () => {}, // LocalStorageGarage's constructor subscribes to "storage"
  }
  ;(globalThis as any).window = fakeWindow
  return {
    uninstall: () => {
      delete (globalThis as any).window
    },
  }
}

const vehicle = (over: Partial<NewVehicle> = {}): NewVehicle =>
  ({ year: 2022, make: "Ford", model: "F-150", savedAt: "t", ...over }) as any

let fake: { uninstall: () => void }
beforeEach(() => {
  fake = installFakeWindow()
})
afterEach(() => {
  fake.uninstall()
})

describe("SingleVehicleGarage — the cache holds at most one vehicle", () => {
  it("add() on an empty cache stores one vehicle and makes it active", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    expect(g.list()).toHaveLength(1)
    expect(g.getActive()?.id).toBe(v.id)
  })

  it("add() replaces the existing vehicle — exactly one remains, the new one, active", () => {
    const g = new SingleVehicleGarage()
    g.add(vehicle({ make: "Ford" }))
    const jeep = g.add(vehicle({ make: "Jeep", model: "Wrangler" }))
    expect(g.list()).toHaveLength(1)
    expect(g.list()[0].make).toBe("Jeep")
    expect(g.getActive()?.id).toBe(jeep.id)
  })

  it("collapses a legacy multi-vehicle localStorage list on the first add()", () => {
    const legacy = new LocalStorageGarage()
    legacy.add(vehicle({ make: "A" }))
    legacy.add(vehicle({ make: "B" }))
    legacy.add(vehicle({ make: "C" }))
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle({ make: "New" }))
    expect(g.list()).toHaveLength(1)
    expect(g.getActive()?.id).toBe(v.id)
  })

  it("inherited remove() clears the cache and the active pointer", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    g.remove(v.id)
    expect(g.list()).toHaveLength(0)
    expect(g.getActive()).toBeNull()
  })

  it("inherited update() patches the single vehicle in place", () => {
    const g = new SingleVehicleGarage()
    const v = g.add(vehicle())
    g.update(v.id, { trim: "Raptor" } as any)
    expect(g.getActive()?.trim).toBe("Raptor")
    expect(g.list()).toHaveLength(1)
  })
})
