// backend/src/modules/customer-vehicle/__tests__/service.test.ts
import CustomerVehicleService from "../service"

function makeService() {
  const rows: any[] = []
  const svc = new (CustomerVehicleService as any)({})
  svc.listCustomerVehicles = async (f: any) => rows.filter(r => r.customer_id === f.customer_id && (f.is_active === undefined || r.is_active === f.is_active))
  svc.updateCustomerVehicles = async (u: any) => { const r = rows.find(x => x.id === u.id); Object.assign(r, u); return r }
  svc._rows = rows
  return { svc, rows }
}

/**
 * Fake `knex_.raw` for activate()'s atomic deactivate-others + activate-target
 * statement (WB-073 G4). Mirrors the real SQL's two phases against an
 * in-memory `rows` array:
 *   1. snapshot the customer's other currently-active rows (the CTE's WHERE),
 *   2. yield (an explicit await — the window a concurrent statement's row
 *      lock / commit would occupy in real Postgres),
 *   3. deactivate that snapshotted set,
 *   4. activate the target — UNLESS some other row for this customer is
 *      (by now) active that our snapshot didn't know about, in which case a
 *      real partial-unique-index write would raise 23505; we throw the same
 *      shape here so activate()'s catch+retry path is exercised for real.
 * Two Promise.all'd activate() calls each invoke this once per attempt with
 * no synchronous work between their own start and their `await tick`, so the
 * yield point genuinely interleaves them (JS runs each call synchronously up
 * to its first await) — a faithful proxy for concurrent-transaction races
 * without a real database.
 */
function installActivateKnexStub(svc: any, rows: any[]) {
  const tick = () => new Promise((r) => setTimeout(r, 0))
  svc.knex_ = {
    raw: async (_sql: string, binds: any[] = []) => {
      const [customerId, excludeId, targetId] = binds
      const toDeactivate = rows.filter(
        (r) => r.customer_id === customerId && r.id !== excludeId && r.is_active && !r.deleted_at
      )
      await tick()
      for (const r of toDeactivate) r.is_active = false
      const target = rows.find((r) => r.id === targetId && !r.deleted_at)
      if (!target) return { rows: [] }
      const othersStillActive = rows.some((r) => r.customer_id === customerId && r.id !== targetId && r.is_active)
      if (othersStillActive) {
        const err: any = new Error('duplicate key value violates unique constraint "UQ_customer_vehicle_one_active"')
        err.code = "23505"
        throw err
      }
      target.is_active = true
      return { rows: [{ id: target.id }] }
    },
  }
}

describe("activate enforces single-active", () => {
  it("clears is_active on the customer's other vehicles", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false }, { id: "z", customer_id: "c2", is_active: true })
    installActivateKnexStub(svc, rows)
    await svc.activate("b", "c1")
    expect(rows.find(r => r.id === "a").is_active).toBe(false)
    expect(rows.find(r => r.id === "b").is_active).toBe(true)
    expect(rows.find(r => r.id === "z").is_active).toBe(true) // other customer untouched
  })

  it("issues a single atomic SQL statement (deactivate-others + activate-target) — no separate list/update calls", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false })
    svc.listCustomerVehicles = async () => { throw new Error("must not be called by activate()") }
    svc.updateCustomerVehicles = async () => { throw new Error("must not be called by activate()") }
    const calls: { sql: string; binds: any[] }[] = []
    svc.knex_ = {
      raw: async (sql: string, binds: any[] = []) => {
        calls.push({ sql, binds })
        rows.forEach((r) => { if (r.customer_id === binds[0] && r.id !== binds[1] && r.id !== binds[2]) r.is_active = false })
        const target = rows.find((r) => r.id === binds[2])
        if (target) target.is_active = true
        return { rows: target ? [{ id: target.id }] : [] }
      },
    }
    await svc.activate("b", "c1")
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toMatch(/with deactivated as[\s\S]*update "customer_vehicle"[\s\S]*"is_active" = false[\s\S]*update "customer_vehicle"[\s\S]*"is_active" = true/i)
    expect(calls[0].binds).toEqual(["c1", "b", "b"])
  })

  it("two near-simultaneous activate calls for the same customer leave EXACTLY ONE active and do not throw", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false }, { id: "c", customer_id: "c1", is_active: false })
    installActivateKnexStub(svc, rows)

    await expect(Promise.all([svc.activate("b", "c1"), svc.activate("c", "c1")])).resolves.toBeDefined()

    const activeRows = rows.filter((r) => r.is_active)
    expect(activeRows).toHaveLength(1) // never zero, never two
    expect(["b", "c"]).toContain(activeRows[0].id)
  })

  it("retries once on a simulated unique-violation and succeeds without throwing to the caller", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false })
    let attempt = 0
    const calls: any[] = []
    svc.knex_ = {
      raw: async (_sql: string, binds: any[]) => {
        calls.push(binds)
        attempt++
        if (attempt === 1) {
          const err: any = new Error('duplicate key value violates unique constraint "UQ_customer_vehicle_one_active"')
          err.code = "23505"
          throw err
        }
        rows.forEach((r) => { if (r.id !== binds[2]) r.is_active = false })
        rows.find((r) => r.id === binds[2])!.is_active = true
        return { rows: [{ id: binds[2] }] }
      },
    }
    await expect(svc.activate("b", "c1")).resolves.toBeUndefined()
    expect(calls).toHaveLength(2) // one failed attempt + one retry
    expect(rows.find((r) => r.id === "b").is_active).toBe(true)
    expect(rows.find((r) => r.id === "a").is_active).toBe(false)
  })

  it("does not retry and rethrows a non-unique-violation error", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true })
    let calls = 0
    svc.knex_ = { raw: async () => { calls++; throw new Error("connection reset") } }
    await expect(svc.activate("a", "c1")).rejects.toThrow(/connection reset/)
    expect(calls).toBe(1) // no retry for a non-23505 error
  })
})

describe("createForCustomer enforces the invariant", () => {
  function makeCreateService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    svc.createCustomerVehicles = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
    return { svc, rows }
  }

  it("always creates inactive even if is_active is somehow passed", async () => {
    const { svc } = makeCreateService()
    const v = await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150", is_active: true } as any)
    expect(v.is_active).toBe(false)
  })

  it("is idempotent on (customer_id, client_id)", async () => {
    const { svc, rows } = makeCreateService()
    await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150" })
    const again = await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150" })
    expect(rows.length).toBe(1)
    expect(again.client_id).toBe("k1")
  })
})

describe("resolveOwned scopes by customer + client_id", () => {
  function makeResolveService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    return { svc, rows }
  }

  it("returns the row matching (customer_id, client_id), carrying the real PK", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c1", client_id: "k1" })
    const row = await svc.resolveOwned("c1", "k1")
    expect(row?.id).toBe("pk_1")
  })

  it("returns undefined for an unknown client_id", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c1", client_id: "k1" })
    expect(await svc.resolveOwned("c1", "nope")).toBeUndefined()
  })

  it("returns undefined for another customer's client_id (cross-tenant isolation)", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c2", client_id: "k1" })
    expect(await svc.resolveOwned("c1", "k1")).toBeUndefined()
  })
})

describe("mergeForCustomer batches idempotently", () => {
  function makeMergeService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    svc.createCustomerVehicles = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
    return { svc, rows }
  }

  it("creates all missing vehicles and returns the customer's full list", async () => {
    const { svc, rows } = makeMergeService()
    const out = await svc.mergeForCustomer("c1", [
      { client_id: "k1", year: 2021, make: "Ford", model: "F-150" },
      { client_id: "k2", year: 2020, make: "Honda", model: "Civic" },
    ])
    expect(rows.length).toBe(2)
    expect(out.length).toBe(2)
  })

  it("is idempotent — re-merging the same batch adds no duplicate rows", async () => {
    const { svc, rows } = makeMergeService()
    const batch = [{ client_id: "k1", year: 2021, make: "Ford", model: "F-150" }]
    await svc.mergeForCustomer("c1", batch)
    await svc.mergeForCustomer("c1", batch)
    expect(rows.length).toBe(1)
  })

  it("returns only the target customer's vehicles (cross-tenant isolation)", async () => {
    const { svc, rows } = makeMergeService()
    rows.push({ id: "x", customer_id: "c2", client_id: "z1" })
    const out = await svc.mergeForCustomer("c1", [{ client_id: "k1", year: 2021, make: "Ford", model: "F-150" }])
    expect(out.every((v: any) => v.customer_id === "c1")).toBe(true)
    expect(out.length).toBe(1)
  })
})
