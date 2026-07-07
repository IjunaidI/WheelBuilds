import { describe, it, expect, vi, beforeEach } from "vitest"

// RoutingGarage learns the auth identity via a fetch (getCustomer()), not an
// argument — mock the data-layer call so each test controls who is "logged
// in" across successive syncAuth() calls, exactly like the real
// login/logout Server Actions do via GarageAuthSync.
vi.mock("@lib/data/customer", () => ({ getCustomer: vi.fn() }))

import { getCustomer } from "@lib/data/customer"
import { RoutingGarage } from "../index"
import type { GarageProvider } from "../provider"
import type { NewVehicle, Vehicle } from "../types"

const mockedGetCustomer = vi.mocked(getCustomer)

/**
 * Fake standing in for MedusaGarage — implements the same structural
 * surface RoutingGarage depends on (GarageProvider + ready/isLoaded/
 * mergeFrom) without touching the network. Injected via RoutingGarage's
 * `createRemote` constructor seam.
 */
class FakeRemoteGarage implements GarageProvider {
  private vehicles: Vehicle[]
  private activeId: string | null = null
  private listeners = new Set<() => void>()

  constructor(seedVehicles: Vehicle[] = []) {
    this.vehicles = seedVehicles
  }

  ready(): Promise<void> { return Promise.resolve() }
  isLoaded(): boolean { return true }
  async mergeFrom(): Promise<boolean> { return true } // nothing under test merges local->remote here

  list(): Vehicle[] { return this.vehicles }
  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = { ...v, id: `fake_${this.vehicles.length}`, savedAt: "t" } as Vehicle
    this.vehicles = [...this.vehicles, vehicle]
    this.emit()
    return vehicle
  }
  update(id: string, patch: Partial<NewVehicle>): Vehicle {
    const idx = this.vehicles.findIndex((v) => v.id === id)
    const updated = { ...this.vehicles[idx], ...patch } as Vehicle
    this.vehicles = [...this.vehicles.slice(0, idx), updated, ...this.vehicles.slice(idx + 1)]
    this.emit()
    return updated
  }
  remove(id: string): void {
    this.vehicles = this.vehicles.filter((v) => v.id !== id)
    this.emit()
  }
  setActive(id: string | null): void { this.activeId = id; this.emit() }
  getActive(): Vehicle | null { return this.vehicles.find((v) => v.id === this.activeId) ?? null }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private emit() { this.listeners.forEach((l) => l()) }
}

const vehicle = (id: string, make: string): Vehicle =>
  ({ id, year: 2022, make, model: "X", savedAt: "t" }) as Vehicle

beforeEach(() => {
  mockedGetCustomer.mockReset()
})

describe("RoutingGarage — customer identity lifecycle (WB-073 G1/G2)", () => {
  it("(G2) rebuilds remote on customer change — customer A's vehicles never show up for B", async () => {
    const perCustomer: Record<string, Vehicle[]> = {
      cust_a: [vehicle("a1", "Ford")],
      cust_b: [vehicle("b1", "Toyota")],
    }
    let lastRequestedFor = ""
    const createRemote = vi.fn(() => new FakeRemoteGarage(perCustomer[lastRequestedFor]))
    const routing = new RoutingGarage(createRemote)

    lastRequestedFor = "cust_a"
    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth()
    expect(routing.list().map((v) => v.id)).toEqual(["a1"])

    lastRequestedFor = "cust_b"
    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    await routing.syncAuth()

    expect(routing.list().map((v) => v.id)).toEqual(["b1"]) // NOT a1 — no leakage from A
    expect(createRemote).toHaveBeenCalledTimes(2) // a genuinely NEW remote instance was built for B
  })

  it("(G2) logout nulls remote so a later login always refetches instead of reusing stale state", async () => {
    let created = 0
    const createRemote = vi.fn(() => {
      created += 1
      return new FakeRemoteGarage([vehicle(`v${created}`, "Honda")])
    })
    const routing = new RoutingGarage(createRemote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    await routing.syncAuth()
    expect(created).toBe(1)
    expect(routing.list().map((v) => v.id)).toEqual(["v1"])

    mockedGetCustomer.mockResolvedValue(null as any) // logout
    await routing.syncAuth()
    expect(routing.list()).toEqual([]) // fell back to the (empty, windowless) local garage

    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any) // same customer logs back in
    await routing.syncAuth()
    expect(created).toBe(2) // remote was rebuilt from scratch, not reused across the logout gap
  })

  it("(G1) a listener subscribed before an auth swap still receives the post-swap provider's emits", async () => {
    const createRemote = vi.fn(() => new FakeRemoteGarage([]))
    const routing = new RoutingGarage(createRemote)

    const listener = vi.fn()
    routing.subscribe(listener) // subscribed while current == local (unauthenticated)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // swap: current -> the fake remote for cust_a
    listener.mockClear() // drop the one-shot "swap happened" emit; isolate what we're testing below

    routing.add({ year: 2023, make: "Mazda", model: "CX-5" } as NewVehicle) // mutates the NEW current

    // Before the fix, `listener` stayed bound to the OLD provider's internal
    // listener set (never re-pointed on swap), so this mutation on the new
    // remote would never reach it — components would go stale after login.
    expect(listener).toHaveBeenCalled()
  })
})
