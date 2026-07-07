import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { LocalStorageGarage } from "./local-storage-garage"
import type { NewVehicle } from "./types"

/**
 * The vitest project runs with `environment: "node"` (see vitest.config.ts),
 * so there is no real `window`/`localStorage` — LocalStorageGarage's own
 * `hasWindow()` guard makes every persistence call a no-op without one. This
 * installs a minimal in-memory fake `window` + `localStorage` +
 * `crypto.randomUUID` for the duration of a test, matching the helper
 * `__tests__/routing-identity.test.ts` already uses for the same reason.
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

const newVehicle: NewVehicle = { year: 2022, make: "Ford", model: "F-150", savedAt: "t" } as any

let fakeWindow: { uninstall: () => void }
beforeEach(() => {
  fakeWindow = installFakeWindow()
})
afterEach(() => {
  fakeWindow.uninstall()
})

describe("LocalStorageGarage.update — missing id does not throw (WB-073 Task 7)", () => {
  // Regression target: garage-pane.tsx's selectVehicle() re-resolves stale
  // fitment asynchronously; the row's Remove (×) button is not disabled
  // during that resolve, so the user can delete the same vehicle before the
  // resolve settles "ok" and calls update(id, ...) against a now-missing id.
  // MedusaGarage.update() was already patched (WB-073 G8 review) to return a
  // placeholder instead of throwing on a missing id — LocalStorageGarage's
  // sibling implementation still threw, which surfaced as an unhandled
  // promise rejection with no user feedback.

  it("does not throw when the target vehicle is missing, and is a clean no-op (other vehicles + storage untouched)", () => {
    const garage = new LocalStorageGarage()
    const kept = garage.add({ ...newVehicle, model: "Explorer" })
    const missingId = "does-not-exist"

    let result: any
    expect(() => {
      result = garage.update(missingId, { notes: "lowered" })
    }).not.toThrow()

    // Return type stays honest (Vehicle-shaped) without throwing — mirrors
    // MedusaGarage.update()'s missing-id placeholder return.
    expect(result.id).toBe(missingId)

    // No-op: the surviving vehicle is completely untouched, and nothing new
    // was persisted.
    expect(garage.list()).toEqual([kept])
    const reread = new LocalStorageGarage()
    expect(reread.list()).toEqual([kept])
  })

  it("does not emit a change notification for a missing-id update — matches MedusaGarage's silent no-op semantics", () => {
    const garage = new LocalStorageGarage()
    garage.add({ ...newVehicle, model: "Explorer" })
    const listener = vi.fn()
    garage.subscribe(listener)

    garage.update("does-not-exist", { notes: "lowered" })

    expect(listener).not.toHaveBeenCalled()
  })

  it("updating an EXISTING vehicle still works — happy path unchanged (updates, persists, emits)", () => {
    const garage = new LocalStorageGarage()
    const vehicle = garage.add(newVehicle)
    const listener = vi.fn()
    garage.subscribe(listener)

    const updated = garage.update(vehicle.id, {
      notes: "lowered",
      canonicalBoltPatterns: ["5x114.3"],
    })

    expect(updated.notes).toBe("lowered")
    expect(updated.canonicalBoltPatterns).toEqual(["5x114.3"])
    expect(garage.list()).toEqual([updated])
    expect(listener).toHaveBeenCalledTimes(1)

    // Persisted — a fresh instance reading the same (fake) localStorage sees it too.
    const reread = new LocalStorageGarage()
    expect(reread.list()).toEqual([updated])
  })

  it("simulates the garage-pane.tsx race: Remove (×) fires while a fitment re-resolve is in flight, then the resolve's update() lands — no throw, no resurrection", () => {
    const garage = new LocalStorageGarage()
    const other = garage.add({ ...newVehicle, model: "Explorer" })
    const stale = garage.add({ ...newVehicle, model: "Ranger" })

    // The async fitment resolve for `stale` is "in flight" — meanwhile the
    // user clicks that row's Remove button, which is synchronous and not
    // gated by `selectingId` in garage-pane.tsx.
    garage.remove(stale.id)
    expect(garage.list().map((v) => v.id)).toEqual([other.id])

    // The resolve then settles "ok" and garage-pane.tsx calls
    // update(stale.id, ...) — the exact call that used to throw and produce
    // an unhandled promise rejection.
    expect(() =>
      garage.update(stale.id, {
        canonicalBoltPatterns: ["5x114.3"],
        fitmentStatus: "ok",
      })
    ).not.toThrow()

    // The removed vehicle must not be resurrected by the stale update.
    expect(garage.list().map((v) => v.id)).toEqual([other.id])
  })
})
