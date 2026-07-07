import { describe, it, expect, vi, beforeEach } from "vitest"

// RoutingGarage learns the auth identity via a fetch (getCustomer()), not an
// argument — mock the data-layer call so each test controls who is "logged
// in" across successive syncAuth() calls, exactly like the real
// login/logout Server Actions do via GarageAuthSync.
vi.mock("@lib/data/customer", () => ({ getCustomer: vi.fn() }))

import { getCustomer } from "@lib/data/customer"
import { RoutingGarage } from "../index"
import { LocalStorageGarage } from "../local-storage-garage"
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
  private mergeImpl: () => Promise<boolean>

  constructor(seedVehicles: Vehicle[] = [], mergeImpl: () => Promise<boolean> = () => Promise.resolve(true)) {
    this.vehicles = seedVehicles
    this.mergeImpl = mergeImpl // overridable so a test can park a merge mid-flight (Fix 4 race coverage)
  }

  // Counts calls so a test can assert RoutingGarage actually invokes it on
  // an identity swap (WB-073 G5 review Fix 2) — satisfies the RemoteGarage
  // structural type MedusaGarage itself implements.
  markSupersededCalls = 0

  // Load-state signal (WB-073 G6) — settable per-instance so a test can
  // simulate a remote whose initial load failed. Defaults preserve every
  // existing test's assumption of an immediately-ready remote.
  loadOk = true
  loadErrorValue: string | null = null

  // Records every mergeFrom() payload so a test can assert WB-022's "one
  // idempotent request, stable ids" contract survived the T6 diff-clear
  // change (i.e. mergeFrom still only ever sees the pre-merge snapshot, not
  // anything added to local mid-merge).
  mergeCalls: Vehicle[][] = []

  ready(): Promise<void> { return Promise.resolve() }
  isLoaded(): boolean { return this.loadOk }
  loadError(): string | null { return this.loadErrorValue }
  retryLoad(): void { this.loadOk = true; this.loadErrorValue = null; this.emit() }
  mergeFrom(vehicles: Vehicle[]): Promise<boolean> { this.mergeCalls.push(vehicles); return this.mergeImpl() }
  markSuperseded(): void { this.markSupersededCalls += 1 }

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

  it("(Fix 2) a transient getCustomer() failure preserves an already-loaded remote instead of discarding it", async () => {
    const createRemote = vi.fn(() => new FakeRemoteGarage([vehicle("a1", "Ford")]))
    const routing = new RoutingGarage(createRemote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // logged in, account garage loaded
    expect(routing.list().map((v) => v.id)).toEqual(["a1"])

    mockedGetCustomer.mockRejectedValueOnce(new Error("network blip"))
    await routing.syncAuth() // transient probe failure — NOT a confirmed logout

    // Old (buggy) behavior: a caught error set customerId=null, which tripped
    // the identity-changed branch and nulled `remote`, discarding the loaded
    // account garage and falling back to the empty local one. Fixed
    // behavior: the failure carries no new information, so remote/current
    // are left exactly as they were — no rebuild, no flicker to empty.
    expect(routing.list().map((v) => v.id)).toEqual(["a1"])
    expect(createRemote).toHaveBeenCalledTimes(1) // remote was never rebuilt because of the blip
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

  it("(G1) a listener subscribed before an auth swap still receives emits across an authenticated A→B swap", async () => {
    // Broadens the G1 property beyond the local->remote (first login) case:
    // a straight account-to-account swap re-points listeners exactly the
    // same way, via the same setCurrent() path.
    const perCustomer: Record<string, Vehicle[]> = { cust_a: [], cust_b: [] }
    let lastRequestedFor = ""
    const createRemote = vi.fn(() => new FakeRemoteGarage(perCustomer[lastRequestedFor]))
    const routing = new RoutingGarage(createRemote)

    const listener = vi.fn()
    routing.subscribe(listener) // subscribed while current == local

    lastRequestedFor = "cust_a"
    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // swap: local -> remote A

    lastRequestedFor = "cust_b"
    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    await routing.syncAuth() // swap: remote A -> remote B
    listener.mockClear() // isolate what happens AFTER the A->B swap

    routing.add({ year: 2023, make: "Mazda", model: "CX-5" } as NewVehicle) // mutates remote B (the new current)

    expect(listener).toHaveBeenCalled()
  })

  it("(G1) a listener subscribed before an auth swap still receives emits across a remote→local (logout) swap", async () => {
    const createRemote = vi.fn(() => new FakeRemoteGarage([]))
    const routing = new RoutingGarage(createRemote)

    const listener = vi.fn()
    routing.subscribe(listener) // subscribed while current == local

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // swap: local -> remote

    mockedGetCustomer.mockResolvedValue(null as any)
    await routing.syncAuth() // swap: remote -> local (logout)
    listener.mockClear() // isolate what happens AFTER the logout swap

    routing.add({ year: 2023, make: "Mazda", model: "CX-5" } as NewVehicle) // mutates local (the new current)

    expect(listener).toHaveBeenCalled()
  })

  it("(Fix 1) a syncAuth() superseded mid-flight by a newer call for a different identity leaves the newer customer's remote current, untouched by the stale continuation", async () => {
    const perCustomer: Record<string, Vehicle[]> = {
      cust_a: [vehicle("a1", "Ford")],
      cust_b: [vehicle("b1", "Toyota")],
    }
    let lastRequestedFor = ""
    const createRemote = vi.fn(() => new FakeRemoteGarage(perCustomer[lastRequestedFor]))
    const routing = new RoutingGarage(createRemote)

    // Defer cust_a's getCustomer() resolution so that syncAuth call is still
    // parked past its first await when cust_b's syncAuth() call starts AND
    // finishes — the "rapid logout -> login as someone else" race, and the
    // same shape as constructor+mount both firing on an already-authed load.
    let resolveA!: (v: { id: string } | null) => void
    const pendingA = new Promise<{ id: string } | null>((resolve) => {
      resolveA = resolve
    })
    mockedGetCustomer.mockReturnValueOnce(pendingA as any)
    lastRequestedFor = "cust_a"
    const syncA = routing.syncAuth() // gen 1: parked awaiting getCustomer()

    mockedGetCustomer.mockResolvedValueOnce({ id: "cust_b" } as any)
    lastRequestedFor = "cust_b"
    const syncB = routing.syncAuth() // gen 2: resolves immediately, runs to completion first
    await syncB

    expect(routing.list().map((v) => v.id)).toEqual(["b1"]) // B's remote is current
    expect(createRemote).toHaveBeenCalledTimes(1) // only B's remote was ever built so far

    // Now let the stale A call's getCustomer() resolve. Its continuation
    // must detect it's been superseded (gen 1 !== current gen 2) and bail
    // before touching `remote`/`current`/merge state at all.
    resolveA({ id: "cust_a" })
    await syncA

    expect(routing.list().map((v) => v.id)).toEqual(["b1"]) // still B — not clobbered by the late A resolution
    expect(createRemote).toHaveBeenCalledTimes(1) // A's remote was never constructed by the superseded call
  })

  it("(Fix 4) a superseded generation's in-flight merge does not clear local, even once it resolves after a newer generation has already taken over", async () => {
    // mergeLocalIntoRemote()'s `remote.mergeFrom()` await is a THIRD race
    // window beyond the two Fix 1 already guards (getCustomer(), remote.ready()).
    // Old (buggy) behavior: mergeLocalIntoRemote() called `this.local.clear()`
    // unconditionally as soon as mergeFrom() resolved true — INSIDE the
    // helper, i.e. before syncAuth()'s post-merge `gen !== this.generation`
    // guard ever runs. A superseded generation's stale merge could therefore
    // still wipe `local` out from under whatever generation is actually
    // current by the time it finally resolves — and because a blanket local
    // clear emits straight to its own listener set, any component still
    // subscribed through `local` would see a spurious "everything's gone"
    // flicker for a request that logically lost the race.
    //
    // Production now calls `local.clearOnly(ids)` (WB-073 G7 / T6), not
    // `local.clear()` (removed — see WB-073 G7 review Fix 4, dead code once
    // nothing called it) — spying on `clear` would pass VACUOUSLY (it's
    // simply never called on this path), proving nothing about the
    // generation guard actually protecting the real clear call. Spy on
    // `clearOnly` (the real path) so this test still catches a regression
    // where a superseded generation reaches the clear call.
    const clearOnlySpy = vi.spyOn(LocalStorageGarage.prototype, "clearOnly")

    // Gen 1 (login as cust_a): let mergeFrom() park indefinitely until the
    // test explicitly resolves it, so gen 2 can complete first.
    let resolveMergeA!: (ok: boolean) => void
    const pendingMergeA = new Promise<boolean>((resolve) => {
      resolveMergeA = resolve
    })
    const createRemote = vi.fn((): any => new FakeRemoteGarage([vehicle("a1", "Ford")], () => pendingMergeA))
    const routing = new RoutingGarage(createRemote)

    const listener = vi.fn()
    routing.subscribe(listener) // subscribed while current == local (unauthenticated)

    mockedGetCustomer.mockResolvedValueOnce({ id: "cust_a" } as any)
    const syncA = routing.syncAuth() // gen 1: runs ahead and parks inside mergeLocalIntoRemote's mergeFrom() await

    // Flush microtasks so gen 1 actually reaches (and parks inside) the
    // mergeFrom() call — past getCustomer() and remote.ready() — before gen
    // 2 starts. setCurrent(remote) is only reached AFTER the merge resolves,
    // so `current` is still `local` here, and the listener above is still
    // bound to it.
    for (let i = 0; i < 5; i++) await Promise.resolve()

    // Gen 2: a confirmed logout for a DIFFERENT identity (customerId: null),
    // completing fully — synchronously, no merge involved — while gen 1 is
    // still parked. `current` was already `local`, so this is a no-op swap,
    // but it is the real-world trigger (rapid login-then-logout) for the gap.
    mockedGetCustomer.mockResolvedValueOnce(null as any)
    await routing.syncAuth()

    expect(routing.list()).toEqual([]) // logged out, on the (empty, windowless) local garage
    listener.mockClear() // isolate what happens when the stale gen-1 merge finally resolves

    resolveMergeA(true) // let gen 1's stale, already-superseded merge resolve now
    await syncA

    expect(clearOnlySpy).not.toHaveBeenCalled() // local was NEVER cleared by the superseded generation
    expect(listener).not.toHaveBeenCalled() // no stale emit reached the still-local-bound listener
    expect(routing.list()).toEqual([]) // still local, untouched — still logged out

    clearOnlySpy.mockRestore()
  })

  it("(WB-073 G5 review Fix 2) supersedes the OLD remote before replacing it on an identity change, so its abandoned writes can no longer toast", async () => {
    const perCustomer: Record<string, Vehicle[]> = {
      cust_a: [vehicle("a1", "Ford")],
      cust_b: [vehicle("b1", "Toyota")],
    }
    let lastRequestedFor = ""
    const instances: FakeRemoteGarage[] = []
    const createRemote = vi.fn(() => {
      const instance = new FakeRemoteGarage(perCustomer[lastRequestedFor])
      instances.push(instance)
      return instance
    })
    const routing = new RoutingGarage(createRemote)

    lastRequestedFor = "cust_a"
    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth()
    expect(instances[0].markSupersededCalls).toBe(0) // not superseded while still current

    lastRequestedFor = "cust_b"
    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    await routing.syncAuth() // A -> B swap

    expect(instances[0].markSupersededCalls).toBe(1) // A's abandoned remote was superseded exactly once
    expect(instances[1].markSupersededCalls).toBe(0) // B (the new current) is not superseded

    mockedGetCustomer.mockResolvedValue(null as any)
    await routing.syncAuth() // B -> logout

    expect(instances[1].markSupersededCalls).toBe(1) // B's remote is superseded on logout too
  })

  it("(G6) isLoaded()/loadError() proxy to the CURRENT remote and stay identity-correct across a customer swap", async () => {
    const failing = new FakeRemoteGarage([])
    failing.loadOk = false
    failing.loadErrorValue = "boom"
    const ready = new FakeRemoteGarage([vehicle("b1", "Toyota")])

    let which: "a" | "b" = "a"
    const createRemote = vi.fn(() => (which === "a" ? failing : ready))
    const routing = new RoutingGarage(createRemote)

    // Unauthenticated (current == local, always ready) — the signal must
    // report ready rather than undefined/loading before any remote exists.
    expect(routing.isLoaded()).toBe(true)
    expect(routing.loadError()).toBeNull()

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // current -> the FAILING remote for A

    expect(routing.isLoaded()).toBe(false)
    expect(routing.loadError()).toBe("boom")

    which = "b"
    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    await routing.syncAuth() // current -> the READY remote for B

    // The signal must reflect B's (current) state, not A's stale failure.
    expect(routing.isLoaded()).toBe(true)
    expect(routing.loadError()).toBeNull()
  })
})

/**
 * The vitest project runs with `environment: "node"` (see vitest.config.ts),
 * so there is no real `window`/`localStorage` — LocalStorageGarage's own
 * `hasWindow()` guard makes it a no-op everywhere else in this file (hence
 * "windowless local garage" in the comments above). Proving the T6 diff-clear
 * actually preserves a vehicle written mid-merge requires REAL persistence
 * (so a second, independent `LocalStorageGarage` instance can read back what
 * survived), so this block installs a minimal in-memory fake `window` +
 * `localStorage` + `crypto.randomUUID` for the duration of a single test and
 * tears it down in a `finally`, rather than reaching for jsdom (not an
 * installed dependency here).
 */
function installFakeWindow(): { uninstall: () => void } {
  const store = new Map<string, string>()
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
    crypto: { randomUUID: () => `id_${store.size}_${Math.random().toString(36).slice(2, 10)}` },
    addEventListener: () => {}, // LocalStorageGarage's constructor subscribes to "storage"
  }
  ;(globalThis as any).window = fakeWindow
  return { uninstall: () => { delete (globalThis as any).window } }
}

describe("RoutingGarage — merge diff-clear preserves a vehicle added mid-merge (WB-073 G7 / T6)", () => {
  it("(Fix 2) clears the FULL pre-merge snapshot — a content-duplicate zombie is cleared even though it was never sent, while a genuinely-new mid-merge add survives an on-its-own-failing drain attempt", async () => {
    const fakeWindow = installFakeWindow()
    try {
      // Seed the guest's local garage BEFORE login:
      //  - v1: SAME content (year|make|model|trim) as a vehicle the account
      //    already has. vehiclesToMerge() (merge.ts) excludes any local
      //    vehicle whose content already matches a remote one, so v1 is
      //    NEVER part of `toAdd`. Clearing only `toAdd`'s ids (the pre-Fix-2
      //    behavior) would never remove it from local — a zombie duplicate
      //    that resurfaces on every future logout.
      //  - v3: genuinely new content — IS part of `toAdd`, merged normally.
      const seedGarage = new LocalStorageGarage()
      const v1 = seedGarage.add({ year: 2021, make: "Ford", model: "F-150", trim: "XLT" } as NewVehicle)
      const v3 = seedGarage.add({ year: 2018, make: "Honda", model: "Civic" } as NewVehicle)

      // remote already owns a vehicle with the SAME content as v1 (e.g. added
      // in a previous session from a different device).
      const r1 = { id: "r_1", year: 2021, make: "Ford", model: "F-150", trim: "XLT", savedAt: "t" } as Vehicle

      // Custom mergeFrom: call #1 (the main merge, expected payload [v3]) is
      // PARKED so the test can add a vehicle mid-merge, then resolves true.
      // Call #2 onward (the Fix-3 drain attempt) always resolves FALSE — this
      // isolates Fix 2's "zombie cleared, genuine add survives" property from
      // Fix 3's "genuine add gets synced", which gets its own dedicated test
      // below with a drain that succeeds.
      let callCount = 0
      let resolveFirst!: (ok: boolean) => void
      const firstPending = new Promise<boolean>((resolve) => { resolveFirst = resolve })
      const mergeImpl = () => {
        callCount += 1
        return callCount === 1 ? firstPending : Promise.resolve(false)
      }
      const remote = new FakeRemoteGarage([r1], mergeImpl)
      const routing = new RoutingGarage(() => remote)

      mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
      const sync = routing.syncAuth() // captures the FULL snapshot [v1, v3], sends toAdd=[v3] (v1 excluded as a content-dup)

      await flushMicrotasks() // let syncAuth reach & park inside the main mergeFrom() await

      // TOCTOU: add a genuinely new vehicle WHILE the main merge is in
      // flight. `current` is still `local` at this point.
      const v2 = routing.add({ year: 2019, make: "Toyota", model: "Tacoma" } as NewVehicle)

      resolveFirst(true)
      await sync

      // Main merge sent only v3 — v1 was a content-duplicate, excluded from toAdd (WB-022 unaffected).
      expect(remote.mergeCalls[0]).toEqual([v3])
      // The Fix-3 drain then attempted v2 (the mid-merge add) as its own call, and it was made to fail.
      expect(remote.mergeCalls[1]).toEqual([v2])

      const survivors = new LocalStorageGarage().list()
      // v1 (zombie duplicate, never sent) is cleared — no longer persists in
      // local (Fix 2, the "no zombie" property). v3 is cleared too (merged
      // normally). v2 (genuinely new, added mid-merge) survives, because its
      // own drain attempt failed — proving it is NOT silently lost, just
      // retried on a later syncAuth tick.
      expect(survivors.map((v) => v.id)).toEqual([v2.id])
    } finally {
      fakeWindow.uninstall()
    }
  })

  it("(Fix 3) a vehicle added mid-merge is drained into remote and cleared from local within the SAME syncAuth call — it doesn't just survive to vanish", async () => {
    const fakeWindow = installFakeWindow()
    try {
      // Seed the guest's local garage BEFORE login — this is what gets
      // snapshotted into the main merge request.
      const seedGarage = new LocalStorageGarage()
      const v1 = seedGarage.add({ year: 2021, make: "Ford", model: "F-150", trim: "XLT" } as NewVehicle)

      // Park mergeFrom() mid-flight so the test can act while it's pending —
      // same technique as the (Fix 4) race test above. EVERY call — the main
      // merge AND the follow-up drain round — resolves true this time.
      let resolveMerge!: (ok: boolean) => void
      const pendingMerge = new Promise<boolean>((resolve) => { resolveMerge = resolve })
      const remote = new FakeRemoteGarage([], () => pendingMerge)
      const routing = new RoutingGarage(() => remote)

      mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
      const sync = routing.syncAuth() // captures the toAdd=[v1] snapshot, calls remote.mergeFrom([v1]) which now pends

      await flushMicrotasks() // let syncAuth reach & park inside the mergeFrom() await

      // TOCTOU: add a vehicle WHILE the merge is in flight. `current` is
      // still `local` at this point (setCurrent(remote) only runs after the
      // merge — and now the drain — settle), so this goes through the exact
      // same path a real "add vehicle" UI action would take during this
      // window.
      const v2 = routing.add({ year: 2019, make: "Toyota", model: "Tacoma" } as NewVehicle)

      resolveMerge(true)
      await sync

      // Two merge requests happened within this SINGLE syncAuth() call: the
      // main merge (v1) and the Fix-3 drain round (v2) — proving the
      // mid-merge add gets synced into the account immediately rather than
      // merely surviving in local to "appear then vanish" until some future
      // login re-merges it.
      expect(remote.mergeCalls).toEqual([[v1], [v2]])

      // Both cleared from local — v2 is now represented on the remote, not
      // sitting in local waiting to disappear the instant `current` flips to
      // remote.
      const survivors = new LocalStorageGarage().list()
      expect(survivors).toEqual([])
    } finally {
      fakeWindow.uninstall()
    }
  })
})

/**
 * FakeRemoteGarage above resolves ready() SYNCHRONOUSLY (Promise.resolve()),
 * with load state already seeded before the fake is even constructed — it
 * can assert what isLoaded()/loadError() report AFTER a load settles, but it
 * can never observe the MID-FLIGHT window, because there is no tick where
 * the fake is "not yet ready." That's exactly the window the G6-review bug
 * lived in: RoutingGarage.setCurrent(remote) only runs AFTER `await
 * remote.ready()` resolves, so between remote construction and that await
 * resolving, `current` was still whatever it was before (typically `local`
 * — ready + empty) and isLoaded() reported a lie. A fake with a manually
 * resolved promise is required to hold that window open long enough to
 * assert against it.
 */
class DeferredRemoteGarage implements GarageProvider {
  private vehicles: Vehicle[] = []
  private activeId: string | null = null
  private listeners = new Set<() => void>()
  private resolveReady!: () => void
  private readyPromise = new Promise<void>((resolve) => {
    this.resolveReady = resolve
  })

  markSupersededCalls = 0
  loadOk = false
  loadErrorValue: string | null = null

  // RoutingGarage.syncAuth() has no try/catch around `await remote.ready()`
  // — because the REAL MedusaGarage.ready() never rejects; load()'s own
  // catch block swallows the network error and records it via
  // loadOk/loadErrorMessage instead of rejecting the `loaded` promise (see
  // medusa-garage.ts's load()). So "the load fails" is modeled the same way
  // here: ready() always RESOLVES, and resolveFailure() flips loadOk/
  // loadErrorValue before resolving it, exactly mirroring the real contract
  // rather than introducing a rejection path that doesn't exist in
  // production.
  ready(): Promise<void> { return this.readyPromise }
  isLoaded(): boolean { return this.loadOk }
  loadError(): string | null { return this.loadErrorValue }
  retryLoad(): void { this.loadOk = true; this.loadErrorValue = null; this.emit() }
  mergeFrom(): Promise<boolean> { return Promise.resolve(true) }
  markSuperseded(): void { this.markSupersededCalls += 1 }

  list(): Vehicle[] { return this.vehicles }
  add(v: NewVehicle): Vehicle {
    const vehicle: Vehicle = { ...v, id: `deferred_${this.vehicles.length}`, savedAt: "t" } as Vehicle
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

  /** Settles the deferred load as a SUCCESS. */
  resolveSuccess(vehicles: Vehicle[] = []): void {
    this.vehicles = vehicles
    this.loadOk = true
    this.loadErrorValue = null
    this.resolveReady()
  }
  /** Settles the deferred load as a FAILURE (see the `ready()` doc comment above for why this resolves rather than rejects). */
  resolveFailure(message = "boom"): void {
    this.loadOk = false
    this.loadErrorValue = message
    this.resolveReady()
  }
}

/** Flushes enough microtask ticks for syncAuth()'s synchronous continuation
 * (past the mocked, already-resolved getCustomer()) to reach and park on
 * `await remote.ready()` — without ever resolving DeferredRemoteGarage's own
 * promise, which only settles when the test explicitly calls
 * resolveSuccess()/resolveFailure(). Mirrors the flush pattern the existing
 * (Fix 4) test above already uses for the same reason. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe("RoutingGarage — in-flight authed load reports 'loading', not empty (WB-073 G6 review)", () => {
  it("reports loading — not ready/empty — for the ENTIRE in-flight window of a real authed load, then flips to ready on success", async () => {
    const remote = new DeferredRemoteGarage()
    const routing = new RoutingGarage(() => remote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    const sync = routing.syncAuth() // starts the authed load — deliberately not awaited yet

    await flushMicrotasks()

    // THE BUG this test targets: before the fix, `current` was still `local`
    // (always ready+empty) for this entire window, because setCurrent(remote)
    // only runs AFTER this await settles — so isLoaded() incorrectly reported
    // true and GarageManager rendered "No vehicles saved yet" instead of
    // "Loading your garage…" for the whole getCustomer()+listVehicles() round
    // trip on every real authed page load.
    expect(routing.isLoaded()).toBe(false)
    expect(routing.loadError()).toBeNull()

    remote.resolveSuccess([vehicle("a1", "Ford")])
    await sync

    expect(routing.isLoaded()).toBe(true)
    expect(routing.loadError()).toBeNull()
    expect(routing.list().map((v) => v.id)).toEqual(["a1"])
  })

  it("surfaces a failed in-flight load as loadError() once settled — loading beforehand, never a bare 'ready + empty'", async () => {
    const remote = new DeferredRemoteGarage()
    const routing = new RoutingGarage(() => remote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    const sync = routing.syncAuth()

    await flushMicrotasks()
    expect(routing.isLoaded()).toBe(false) // still loading — not yet failed, not yet ready
    expect(routing.loadError()).toBeNull()

    remote.resolveFailure("Couldn't load your garage — please try again.")
    await sync

    expect(routing.isLoaded()).toBe(false)
    expect(routing.loadError()).toBe("Couldn't load your garage — please try again.")
  })

  it("a customer swap reports LOADING for the incoming customer during its in-flight window, not the outgoing customer's settled state", async () => {
    const remoteA = new DeferredRemoteGarage()
    let active: DeferredRemoteGarage = remoteA
    const createRemote = vi.fn(() => active)
    const routing = new RoutingGarage(createRemote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    const syncA = routing.syncAuth()
    remoteA.resolveSuccess([vehicle("a1", "Ford")])
    await syncA
    expect(routing.isLoaded()).toBe(true) // A fully settled, ready

    const remoteB = new DeferredRemoteGarage()
    active = remoteB
    mockedGetCustomer.mockResolvedValue({ id: "cust_b" } as any)
    const syncB = routing.syncAuth() // swap starts — B's load is now in flight

    await flushMicrotasks()

    // Must report loading for B's in-flight window — NOT fall back to A's
    // already-settled "ready" state just because `current` hasn't been
    // repointed at B yet (same root cause as the first-login case above,
    // now exercised across an identity change rather than a first load).
    expect(routing.isLoaded()).toBe(false)
    expect(routing.loadError()).toBeNull()

    remoteB.resolveSuccess([vehicle("b1", "Toyota")])
    await syncB

    expect(routing.isLoaded()).toBe(true)
    expect(routing.loadError()).toBeNull()
    expect(routing.list().map((v) => v.id)).toEqual(["b1"])
  })
})

/**
 * The (G6) suite above proves isLoaded() reports loading for the window
 * between an identity-changed remote being built and its ready() settling.
 * It does NOT prove anything about the window BEFORE that — between
 * syncAuth() starting and getCustomer() itself resolving — because every
 * fake there (FakeRemoteGarage, DeferredRemoteGarage alike) only ever comes
 * into existence AFTER getCustomer() has already resolved to a truthy
 * customerId (a remote is only ever built inside the identity-changed
 * branch). getCustomer() itself was never deferred, so that earlier window
 * was never held open long enough to assert against — exactly where the
 * WB-073 G10 review bug lived: `loading` started `false` and was ONLY ever
 * set from inside syncAuth()'s post-getCustomer() identity-changed branch,
 * so for the whole getCustomer() round trip isLoaded() fell through to
 * `this.current.isLoaded?.()` — `local`, always ready+empty — and reported
 * `true`. FitmentSync (orphaned-?fit strip) and GaragePill (label) both read
 * that premature `true` and acted on it.
 */
describe("RoutingGarage — isLoaded() during the pre-getCustomer() boot window (WB-073 G10 review)", () => {
  it("isLoaded() is false from the instant the boot probe starts — before getCustomer() has even resolved — then true once a GUEST identity settles", async () => {
    const createRemote = vi.fn(() => new FakeRemoteGarage([]))
    const routing = new RoutingGarage(createRemote)

    let resolveCustomer!: (v: { id: string } | null) => void
    const pending = new Promise<{ id: string } | null>((resolve) => {
      resolveCustomer = resolve
    })
    mockedGetCustomer.mockReturnValueOnce(pending as any)

    const sync = routing.syncAuth() // the boot probe (gen 1) — deliberately not awaited yet

    // THE BUG this test targets: before the fix, `loading` was set only from
    // INSIDE the identity-changed branch, reachable only AFTER getCustomer()
    // resolves — so for this entire real network round trip isLoaded() fell
    // through to `local` (always ready+empty) and lied "true."
    expect(routing.isLoaded()).toBe(false)
    expect(routing.loadError()).toBeNull()

    resolveCustomer(null) // guest — no customer
    await sync

    expect(routing.isLoaded()).toBe(true) // settled: local is ready, no permanent loading purgatory
    expect(createRemote).not.toHaveBeenCalled() // never was an identity to build a remote for
  })

  it("isLoaded() is false before getCustomer() resolves, then true once an AUTHED identity settles", async () => {
    const remote = new FakeRemoteGarage([vehicle("a1", "Ford")])
    const createRemote = vi.fn(() => remote)
    const routing = new RoutingGarage(createRemote)

    let resolveCustomer!: (v: { id: string } | null) => void
    const pending = new Promise<{ id: string } | null>((resolve) => {
      resolveCustomer = resolve
    })
    mockedGetCustomer.mockReturnValueOnce(pending as any)

    const sync = routing.syncAuth()
    expect(routing.isLoaded()).toBe(false)

    resolveCustomer({ id: "cust_a" })
    await sync

    expect(routing.isLoaded()).toBe(true)
    expect(routing.list().map((v) => v.id)).toEqual(["a1"])
  })

  it("a SAME-customer re-sync never flips isLoaded() back to false — no nav-remount flash", async () => {
    const remote = new FakeRemoteGarage([vehicle("a1", "Ford")])
    const createRemote = vi.fn(() => remote)
    const routing = new RoutingGarage(createRemote)

    mockedGetCustomer.mockResolvedValue({ id: "cust_a" } as any)
    await routing.syncAuth() // boot probe (gen 1) settles, authed
    expect(routing.isLoaded()).toBe(true)

    // GarageAuthSync re-firing on a remount with the SAME customerId (the
    // real-world trigger: a client component remounting without any actual
    // login/logout). syncAuth() sees customerId === remoteCustomerId and
    // skips the identity-changed branch entirely — and this is gen 2, so it
    // is NOT the boot probe either.
    const sync2 = routing.syncAuth()
    // Checked SYNCHRONOUSLY, immediately after invocation and before
    // awaiting anything — precisely the tick a naive "always set
    // loading=true at the top of every call" implementation would have
    // flipped transiently, flashing every ordinary navigation.
    expect(routing.isLoaded()).toBe(true)

    await sync2
    expect(routing.isLoaded()).toBe(true)
    expect(createRemote).toHaveBeenCalledTimes(1) // remote was never rebuilt for the re-sync
  })

  it("a transient getCustomer() failure on the very first (boot) probe still clears loading — no permanent loading purgatory", async () => {
    const createRemote = vi.fn(() => new FakeRemoteGarage([]))
    const routing = new RoutingGarage(createRemote)

    mockedGetCustomer.mockRejectedValueOnce(new Error("network blip"))
    await routing.syncAuth() // boot probe (gen 1) — its only getCustomer() call fails

    // local is synchronous and genuinely ready; a failed boot probe carries
    // no identity information, so we fall back to it rather than being
    // stuck reporting loading forever with nothing left to clear it.
    expect(routing.isLoaded()).toBe(true)
    expect(createRemote).not.toHaveBeenCalled()
  })
})
