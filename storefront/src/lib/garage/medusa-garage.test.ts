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
import { MedusaGarage } from "./medusa-garage"
import type { NewVehicle } from "./types"

const mockedCreate = vi.mocked(api.createVehicle)
const mockedActivate = vi.mocked(api.activateVehicle)
const mockedUpdate = vi.mocked(api.updateVehicle)
const mockedList = vi.mocked(api.listVehicles)

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
