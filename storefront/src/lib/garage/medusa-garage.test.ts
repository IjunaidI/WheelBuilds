import { describe, it, expect, vi, beforeEach } from "vitest"

// MedusaGarage talks to the account-vehicles API through this data module —
// mock it so tests control exactly when each network call resolves, without
// touching the network (same pattern as routing-identity.test.ts).
vi.mock("@lib/data/customer-vehicles", () => ({
  listVehicles: vi.fn(),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
  deleteVehicle: vi.fn(),
  activateVehicle: vi.fn(),
  mergeVehicles: vi.fn(),
}))

import * as api from "@lib/data/customer-vehicles"
import { MedusaGarage, onGarageError } from "./medusa-garage"
import type { NewVehicle } from "./types"

const mockedCreate = vi.mocked(api.createVehicle)
const mockedActivate = vi.mocked(api.activateVehicle)
const mockedUpdate = vi.mocked(api.updateVehicle)
const mockedDelete = vi.mocked(api.deleteVehicle)
const mockedList = vi.mocked(api.listVehicles)

const FAILURE_MESSAGE = "Couldn't save your garage change — please try again."

/** Flushes `n` microtask turns — same convention the G3 tests above use. */
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

const newVehicle: NewVehicle = { year: 2022, make: "Ford", model: "F-150", savedAt: "t" } as any

beforeEach(() => {
  vi.clearAllMocks()
  // Constructor kicks off load() only when `window` is defined (vitest runs
  // with environment: "node", so this never fires) — mocked anyway for
  // safety if that ever changes.
  mockedList.mockResolvedValue({ vehicles: [] })
})

describe("MedusaGarage — authed add orders create before activate/update (WB-073 G3)", () => {
  it("does not call activateVehicle until createVehicle's network call has resolved, even though setActive() is invoked synchronously right after add()", async () => {
    const calls: string[] = []
    let resolveCreate!: () => void
    mockedCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => {
            calls.push("create")
            resolve({ vehicle: {} } as any)
          }
        })
    )
    mockedActivate.mockImplementation(async () => {
      calls.push("activate")
      return { active: true } as any
    })

    const garage = new MedusaGarage()

    // Mirrors ymm-pane.tsx: add() then setActive() fire back-to-back,
    // synchronously, in the same tick.
    const vehicle = garage.add(newVehicle)
    garage.setActive(vehicle.id)

    // Optimistic UI must already reflect both mutations synchronously.
    expect(garage.list().map((v) => v.id)).toEqual([vehicle.id])
    expect(garage.getActive()?.id).toBe(vehicle.id)

    // Flush several microtask turns — if the bug were present, activate
    // would already have fired by now since it never waited on create.
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(calls).toEqual([]) // createVehicle hasn't resolved yet — activateVehicle must not have fired

    resolveCreate()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(calls).toEqual(["create", "activate"]) // create resolved BEFORE activate fired
    expect(mockedActivate).toHaveBeenCalledWith(vehicle.id) // targets the same server id create used
  })

  it("does not call updateVehicle (the fitment write-back) until createVehicle has resolved", async () => {
    const calls: string[] = []
    let resolveCreate!: () => void
    mockedCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => {
            calls.push("create")
            resolve({ vehicle: {} } as any)
          }
        })
    )
    mockedUpdate.mockImplementation(async () => {
      calls.push("update")
      return { vehicle: {} } as any
    })

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    // Local mutation is synchronous even though the fitment update fires later.
    const updated = garage.update(vehicle.id, { canonicalBoltPatterns: ["5x114.3"] })
    expect(updated.canonicalBoltPatterns).toEqual(["5x114.3"])

    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(calls).toEqual([]) // updateVehicle must not fire before createVehicle resolves

    resolveCreate()
    for (let i = 0; i < 5; i++) await Promise.resolve()

    expect(calls).toEqual(["create", "update"])
  })

  it("does not delay activateVehicle/updateVehicle for a vehicle that was never created this session (e.g. loaded from the account)", async () => {
    mockedActivate.mockResolvedValue({ active: true } as any)
    const garage = new MedusaGarage()
    // No add() call for "existing-id" — simulates a vehicle already known to
    // the account (loaded via listVehicles), not created in this session.
    garage.setActive("existing-id")

    await Promise.resolve()
    await Promise.resolve()

    expect(mockedActivate).toHaveBeenCalledWith("existing-id")
  })
})

describe("MedusaGarage — surfaces write failures with toast + rollback, not .catch(()=>{}) (WB-073 G5)", () => {
  it("create failure rolls back the optimistic add and notifies once, even with setActive() queued right after add() (pendingCreate path)", async () => {
    mockedCreate.mockRejectedValue(new Error("network down"))
    mockedActivate.mockResolvedValue({ active: true } as any)
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    garage.setActive(vehicle.id)

    // Optimistic state applied synchronously, same as the G3 tests above.
    expect(garage.list().map((v) => v.id)).toEqual([vehicle.id])
    expect(garage.getActive()?.id).toBe(vehicle.id)

    await flush()

    // Rolled back to the pre-add snapshot.
    expect(garage.list()).toEqual([])
    expect(garage.getActive()).toBeNull()
    expect(errors).toEqual([FAILURE_MESSAGE]) // exactly one toast for the one real failure
    // setActive's queued network call must not fire for a vehicle whose
    // create failed — it never existed server-side.
    expect(mockedActivate).not.toHaveBeenCalled()

    unsubscribe()
  })

  it("create failure rolls back the optimistic add and notifies once, even with update() queued right after add() (pendingCreate path)", async () => {
    mockedCreate.mockRejectedValue(new Error("network down"))
    mockedUpdate.mockResolvedValue({ vehicle: {} } as any)
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    garage.update(vehicle.id, { canonicalBoltPatterns: ["5x114.3"] })

    await flush()

    expect(garage.list()).toEqual([])
    expect(garage.getActive()).toBeNull()
    expect(errors).toEqual([FAILURE_MESSAGE])
    expect(mockedUpdate).not.toHaveBeenCalled()

    unsubscribe()
  })

  it("update() failure restores the pre-update fields and notifies", async () => {
    mockedCreate.mockResolvedValue({ vehicle: {} } as any)
    mockedUpdate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    await flush() // let create settle so update's network call actually fires

    const before = garage.list()[0]
    garage.update(vehicle.id, { notes: "lowered" })
    expect(garage.list()[0].notes).toBe("lowered") // optimistic

    await flush()

    expect(garage.list()[0]).toEqual(before) // rolled back to the pre-update snapshot
    expect(errors).toEqual([FAILURE_MESSAGE])

    unsubscribe()
  })

  it("remove() failure re-inserts the vehicle, restores it as active, and notifies", async () => {
    mockedCreate.mockResolvedValue({ vehicle: {} } as any)
    mockedDelete.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    await flush()
    expect(garage.getActive()?.id).toBe(vehicle.id) // auto-activated as the only vehicle

    garage.remove(vehicle.id)
    expect(garage.list()).toEqual([])
    expect(garage.getActive()).toBeNull()

    await flush()

    expect(garage.list().map((v) => v.id)).toEqual([vehicle.id]) // re-inserted
    expect(garage.getActive()?.id).toBe(vehicle.id) // restored as active
    expect(errors).toEqual([FAILURE_MESSAGE])

    unsubscribe()
  })

  it("setActive() failure restores the prior active vehicle and notifies", async () => {
    mockedCreate.mockResolvedValue({ vehicle: {} } as any)
    mockedActivate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const first = garage.add({ ...newVehicle, model: "Explorer" })
    await flush()
    const second = garage.add({ ...newVehicle, model: "Ranger" })
    await flush()

    expect(garage.getActive()?.id).toBe(first.id) // auto-activated on first add

    garage.setActive(second.id)
    expect(garage.getActive()?.id).toBe(second.id) // optimistic

    await flush()

    expect(garage.getActive()?.id).toBe(first.id) // rolled back
    expect(errors).toEqual([FAILURE_MESSAGE])

    unsubscribe()
  })

  it("remove() failure re-inserts the vehicle at its ORIGINAL index, not appended to the end (WB-073 G5 review Fix 3)", async () => {
    mockedCreate.mockResolvedValue({ vehicle: {} } as any)
    mockedDelete.mockRejectedValue(new Error("network down"))

    const garage = new MedusaGarage()
    const first = garage.add({ ...newVehicle, model: "Explorer" })
    await flush()
    const second = garage.add({ ...newVehicle, model: "Ranger" })
    await flush()
    const third = garage.add({ ...newVehicle, model: "Bronco" })
    await flush()

    expect(garage.list().map((v) => v.id)).toEqual([first.id, second.id, third.id])

    garage.remove(second.id) // remove the MIDDLE vehicle
    expect(garage.list().map((v) => v.id)).toEqual([first.id, third.id])

    await flush()

    // Restored between first and third — its original position — not
    // appended after third (which would silently reorder the garage).
    expect(garage.list().map((v) => v.id)).toEqual([first.id, second.id, third.id])
  })
})

describe("MedusaGarage — update()/setActive() degrade gracefully on a vehicle already rolled back, instead of throwing (WB-073 G5 review Fix 1)", () => {
  it("update() called after a real await gap during which the vehicle's create rejected (and was rolled back) does not throw and is a clean no-op", async () => {
    // Mirrors the real ymm-pane.tsx sequencing: add() -> setActive() ->
    // await getFitmentByVehicle(...) -> update(vehicle.id, ...). We simulate
    // the "await gap" with a real `await flush()` between add() and
    // update() so the createVehicle() rejection's rollback has a chance to
    // actually run BEFORE update() is called — the exact race the review
    // flagged as reachable, not theoretical.
    mockedCreate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)

    await flush() // let the create rejection + rollback run to completion

    expect(garage.list()).toEqual([]) // confirms the rollback already happened
    expect(errors).toEqual([FAILURE_MESSAGE]) // ...and already toasted once

    expect(() =>
      garage.update(vehicle.id, { canonicalBoltPatterns: ["5x114.3"] })
    ).not.toThrow() // the old behavior threw synchronously here

    await flush()

    // No second toast for the same root failure, and no network call fires
    // for a vehicle that never reached the server.
    expect(errors).toEqual([FAILURE_MESSAGE])
    expect(mockedUpdate).not.toHaveBeenCalled()

    unsubscribe()
  })

  it("setActive() on a vehicle whose create already rolled back does not throw and does not reactivate a ghost id", async () => {
    mockedCreate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    await flush()

    expect(garage.list()).toEqual([])
    expect(garage.getActive()).toBeNull()

    expect(() => garage.setActive(vehicle.id)).not.toThrow()
    expect(garage.getActive()).toBeNull() // must not point activeId at a rolled-back vehicle

    await flush()

    expect(errors).toEqual([FAILURE_MESSAGE]) // no second toast
    expect(mockedActivate).not.toHaveBeenCalled()

    unsubscribe()
  })
})

describe("MedusaGarage — a superseded instance never toasts into another session (WB-073 G5 review Fix 2)", () => {
  it("a superseded instance's rollback still corrects its own local state, but does not notify", async () => {
    mockedCreate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    // Simulates RoutingGarage rebuilding `remote` for a different identity
    // (e.g. logout) while this instance's create is still in flight.
    garage.markSuperseded()

    await flush()

    expect(garage.list().map((v) => v.id)).not.toContain(vehicle.id) // rollback still ran locally...
    expect(errors).toEqual([]) // ...but must NOT surface as a toast to whoever is on the page now

    unsubscribe()
  })

  it("a superseded instance's remove()-failure rollback also does not notify", async () => {
    mockedCreate.mockResolvedValue({ vehicle: {} } as any)
    mockedDelete.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    const vehicle = garage.add(newVehicle)
    await flush()

    garage.remove(vehicle.id)
    garage.markSuperseded() // superseded WHILE the deleteVehicle() call is in flight

    await flush()

    expect(errors).toEqual([]) // rollback happened, but silently — this instance is abandoned

    unsubscribe()
  })

  it("markSuperseded() does not affect a fresh (still-current) instance — it still notifies normally", async () => {
    mockedCreate.mockRejectedValue(new Error("network down"))
    const errors: string[] = []
    const unsubscribe = onGarageError((msg) => errors.push(msg))

    const garage = new MedusaGarage()
    garage.add(newVehicle)
    await flush()

    expect(errors).toEqual([FAILURE_MESSAGE]) // sanity: not superseded => notifies as before

    unsubscribe()
  })
})
