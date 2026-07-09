// backend/src/modules/customer-vehicle/__tests__/service.test.ts
import { MedusaError } from "@medusajs/framework/utils"
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
 * Fake knex for activate()'s TRANSACTION-based deactivate-then-activate (WB-073
 * G4 + the live-Postgres fix). The real code opens ONE transaction and issues
 * THREE ordered raw statements: (1) resolve `target` (customer_id, id, not
 * deleted); (2) deactivate the customer's OTHER active rows; (3) activate the
 * target, `returning "id"`. Running the deactivate as its own statement BEFORE
 * the activate is the whole point of the fix — it keeps the non-deferrable
 * PARTIAL index `UQ_customer_vehicle_one_active` from ever seeing two active
 * rows at once, which a single combined statement / data-modifying CTE could,
 * raising 23505 on a real Postgres.
 *
 * This stub models `transaction(cb)` by handing the callback a `trx.raw` that
 * dispatches on the SQL text (select / is_active=false / is_active=true) over an
 * in-memory `rows` array. The deactivate phase awaits a tick so two Promise.all'd
 * activate() calls genuinely interleave (a proxy for concurrent transactions):
 * whichever activates second finds the other already active and throws a 23505,
 * exercising activate()'s catch+retry — the retry re-runs against the now-settled
 * state and resolves. An unknown/unowned/soft-deleted id makes phase (1) return
 * no rows, so activate() early-returns 0 WITHOUT deactivating anything (the
 * customer's real active vehicle is never touched) and reports NOT_FOUND.
 *
 * binds mirror the real SQL's positional order for every statement: [customerId, id].
 */
function installActivateKnexStub(svc: any, rows: any[]) {
  const tick = () => new Promise((r) => setTimeout(r, 0))
  const makeTrx = () => ({
    raw: async (sql: string, binds: any[] = []) => {
      const [customerId, targetId] = binds
      if (/^\s*select/i.test(sql)) {
        const target = rows.find((r) => r.id === targetId && r.customer_id === customerId && !r.deleted_at)
        return { rows: target ? [{ id: target.id }] : [] }
      }
      if (/"is_active"\s*=\s*false/i.test(sql)) {
        const toDeactivate = rows.filter(
          (r) => r.customer_id === customerId && r.id !== targetId && r.is_active && !r.deleted_at
        )
        await tick() // yield — the window a concurrent transaction can interleave through
        for (const r of toDeactivate) r.is_active = false
        return { rows: [] }
      }
      // activate target — if a concurrent transaction activated another of this
      // customer's rows between our deactivate and now, a real partial-unique
      // index write raises 23505; mirror that so the retry path is exercised.
      const othersStillActive = rows.some(
        (r) => r.customer_id === customerId && r.id !== targetId && r.is_active && !r.deleted_at
      )
      if (othersStillActive) {
        const err: any = new Error('duplicate key value violates unique constraint "UQ_customer_vehicle_one_active"')
        err.code = "23505"
        throw err
      }
      const target = rows.find((r) => r.id === targetId && r.customer_id === customerId && !r.deleted_at)
      if (!target) return { rows: [] }
      target.is_active = true
      return { rows: [{ id: target.id }] }
    },
  })
  svc.knex_ = {
    transaction: async (cb: (trx: any) => Promise<any>) => cb(makeTrx()),
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

  it("runs inside ONE transaction, resolves target then deactivates BEFORE activating — no MedusaService list/update calls", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false })
    svc.listCustomerVehicles = async () => { throw new Error("must not be called by activate()") }
    svc.updateCustomerVehicles = async () => { throw new Error("must not be called by activate()") }
    const order: string[] = []
    svc.knex_ = {
      transaction: async (cb: (trx: any) => Promise<any>) => {
        order.push("begin")
        const trx = {
          raw: async (sql: string, binds: any[] = []) => {
            const [customerId, targetId] = binds
            // Every statement is scoped by BOTH customer_id and the target id
            // (WB-073 G4 review) so a foreign/unknown id touches nothing.
            expect(binds).toEqual(["c1", "b"])
            if (/^\s*select/i.test(sql)) {
              order.push("select")
              const t = rows.find((r) => r.id === targetId && r.customer_id === customerId)
              return { rows: t ? [{ id: t.id }] : [] }
            }
            if (/"is_active"\s*=\s*false/i.test(sql)) {
              order.push("deactivate")
              rows.forEach((r) => { if (r.customer_id === customerId && r.id !== targetId) r.is_active = false })
              return { rows: [] }
            }
            order.push("activate")
            rows.find((r) => r.id === targetId)!.is_active = true
            return { rows: [{ id: targetId }] }
          },
        }
        return cb(trx)
      },
    }
    await svc.activate("b", "c1")
    // The crux of the live-Postgres fix: one transaction, and the deactivate MUST
    // land before the activate so the partial unique index never sees two active
    // rows. (The old single-CTE version could interleave them and 23505.)
    expect(order).toEqual(["begin", "select", "deactivate", "activate"])
    expect(rows.find((r) => r.id === "a").is_active).toBe(false)
    expect(rows.find((r) => r.id === "b").is_active).toBe(true)
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
    svc.knex_ = {
      transaction: async (cb: (trx: any) => Promise<any>) => {
        attempt++
        if (attempt === 1) {
          // First whole transaction fails the way a real concurrent-activate race would.
          const err: any = new Error('duplicate key value violates unique constraint "UQ_customer_vehicle_one_active"')
          err.code = "23505"
          throw err
        }
        const trx = {
          raw: async (sql: string, binds: any[] = []) => {
            const targetId = binds[1] // binds = [customerId, id]
            if (/^\s*select/i.test(sql)) return { rows: [{ id: targetId }] }
            if (/"is_active"\s*=\s*false/i.test(sql)) { rows.forEach((r) => { if (r.id !== targetId) r.is_active = false }); return { rows: [] } }
            rows.find((r) => r.id === targetId)!.is_active = true
            return { rows: [{ id: targetId }] }
          },
        }
        return cb(trx)
      },
    }
    await expect(svc.activate("b", "c1")).resolves.toBeUndefined()
    expect(attempt).toBe(2) // one failed attempt + one retry
    expect(rows.find((r) => r.id === "b").is_active).toBe(true)
    expect(rows.find((r) => r.id === "a").is_active).toBe(false)
  })

  it("does not retry and rethrows a non-unique-violation error", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true })
    let calls = 0
    svc.knex_ = { transaction: async () => { calls++; throw new Error("connection reset") } }
    await expect(svc.activate("a", "c1")).rejects.toThrow(/connection reset/)
    expect(calls).toBe(1) // no retry for a non-23505 error
  })

  // WB-073 G4 review: the final activation UPDATE previously matched on `id`
  // alone, with no `customer_id` scoping. Activating an id that belongs to a
  // different customer (or doesn't belong to this customer at all) would
  // still run the deactivate-others half against the calling customer_id —
  // deactivating their real active vehicle, even though the deactivate CTE
  // itself already filtered by customer_id — because a Postgres
  // data-modifying CTE executes once evaluated, independent of whether the
  // main statement's WHERE later matches anything. The activate half then
  // matched zero rows, silently reporting success. Fixed via a `target` CTE
  // that resolves (customer_id, id) to a real owned row FIRST and gates the
  // deactivate half on its existence, so an id that isn't this customer's
  // makes the WHOLE statement a no-op — and a zero-row activation is now
  // reported as not-found, not a silent success.
  it("activating an id that does NOT belong to the customer affects zero rows, does not deactivate the customer's active vehicle, and throws not-found", async () => {
    const { svc, rows } = makeService()
    rows.push(
      { id: "a", customer_id: "c1", is_active: true }, // c1's real active vehicle
      { id: "z", customer_id: "c2", is_active: false } // belongs to a different tenant
    )
    installActivateKnexStub(svc, rows)

    await expect(svc.activate("z", "c1")).rejects.toMatchObject({ type: MedusaError.Types.NOT_FOUND })

    expect(rows.find((r) => r.id === "a").is_active).toBe(true) // c1's active vehicle untouched — NOT deactivated
    expect(rows.find((r) => r.id === "z").is_active).toBe(false) // foreign row untouched — NOT activated
  })

  it("happy path: activating an owned, existing id still activates exactly one vehicle and resolves successfully", async () => {
    const { svc, rows } = makeService()
    rows.push(
      { id: "a", customer_id: "c1", is_active: true },
      { id: "b", customer_id: "c1", is_active: false }
    )
    installActivateKnexStub(svc, rows)

    await expect(svc.activate("b", "c1")).resolves.toBeUndefined()

    const active = rows.filter((r) => r.customer_id === "c1" && r.is_active)
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe("b")
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
