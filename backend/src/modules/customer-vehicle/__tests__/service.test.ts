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

describe("activate enforces single-active", () => {
  it("clears is_active on the customer's other vehicles", async () => {
    const { svc, rows } = makeService()
    rows.push({ id: "a", customer_id: "c1", is_active: true }, { id: "b", customer_id: "c1", is_active: false }, { id: "z", customer_id: "c2", is_active: true })
    await svc.activate("b", "c1")
    expect(rows.find(r => r.id === "a").is_active).toBe(false)
    expect(rows.find(r => r.id === "b").is_active).toBe(true)
    expect(rows.find(r => r.id === "z").is_active).toBe(true) // other customer untouched
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
