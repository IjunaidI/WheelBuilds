// backend/src/modules/wheel-size/__tests__/service.test.ts
import WheelSizeService from "../service"

function makeService(clientResults: any[], opts: any = {}) {
  let i = 0
  const client = { byModel: async () => clientResults[i++] }
  const store: any = { fitment: new Map(), quota: { day: "", count: 0 } }
  const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
  svc.client_ = client
  // stub the MedusaService-generated methods used by getFitment
  svc.listWheelSizeFitments = async ({ cache_key }: any) => { const v = store.fitment.get(cache_key); return v ? [v] : [] }
  svc.createWheelSizeFitments = async (row: any) => { store.fitment.set(row.cache_key, row); return row }
  svc._quotaCount = 0
  svc.incrementAndCheckQuota = async () => { svc._quotaCount++; return svc._quotaCount <= (opts.ceiling ?? 5000) }
  return { svc, store }
}

describe("WheelSizeService.getFitment", () => {
  it("classifies non-2xx empty body as an outage (throws QuotaOutageError)", async () => {
    const { svc } = makeService([{ status: 403, empty: true, body: null }])
    await expect(svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })).rejects.toThrow(/outage/i)
  })

  it("classifies 200 + empty data as not_found and caches the sentinel", async () => {
    // Two empty results: the primary (usdm + trim "m") AND the same-region no-trim
    // retry that the fallback now performs when a trim slug yields nothing.
    const empty = { status: 200, empty: false, body: { data: [] } }
    const { svc, store } = makeService([empty, empty])
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.status).toBe("not_found")
    expect(store.fitment.get("honda|accord|m|usdm").status).toBe("not_found")
  })

  it("returns the cached row on the second call without hitting the client", async () => {
    const { svc } = makeService([{ status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 64.1 }, wheels: [] } ] } }])
    const a = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    const b = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" }) // client would throw (no 2nd result) if called
    expect(a.canonicalBoltPatterns).toEqual(b.canonicalBoltPatterns)
  })
})

// A client keyed by the region argument (vs. the sequential array client above),
// so a test can assert WHICH regions were probed and in what order.
function makeRegionService(byRegion: Record<string, any>, opts: any = {}) {
  const calls: any[] = []
  const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
  svc.client_ = {
    byModel: async (p: any) => {
      calls.push(p)
      return byRegion[p.region] ?? { status: 200, empty: false, body: { data: [] } }
    },
  }
  const store: any = { fitment: new Map() }
  svc.listWheelSizeFitments = async ({ cache_key }: any) => { const v = store.fitment.get(cache_key); return v ? [v] : [] }
  svc.createWheelSizeFitments = async (row: any) => { store.fitment.set(row.cache_key, row); return row }
  svc._quotaCount = 0
  svc.incrementAndCheckQuota = async () => { svc._quotaCount++; return svc._quotaCount <= (opts.ceiling ?? 5000) }
  return { svc, calls, store }
}

// wheel-size returns empty `data` for a region it has no records in, but its
// `meta.regions` map still reports which regions DO have data (+ a stray `limit`).
const emptyWithRegions = (regions: Record<string, number>) =>
  ({ status: 200, empty: false, body: { data: [], meta: { regions: { limit: 50, ...regions } } } })
const record = (stud_holes: number, pcd: number | null) =>
  ({ status: 200, empty: false, body: { data: [{ technical: { stud_holes, pcd, centre_bore: 64.1 }, wheels: [] } ] } })

describe("WheelSizeService.getFitment region fallback", () => {
  it("falls back to the region wheel-size reports has data when the requested region is empty", async () => {
    const { svc, calls } = makeRegionService({
      usdm: emptyWithRegions({ eudm: 3 }),
      eudm: record(5, 112),
    })
    const f = await svc.getFitment({ make: "bmw", model: "3-series", year: "2022", region: "usdm" })
    expect(f.status).toBe("ok")
    expect(f.canonicalBoltPatterns).toContain("5x112")
    expect(f.source.region).toBe("eudm")
    expect(calls.map((c) => c.region)).toEqual(["usdm", "eudm"])
  })

  it("uses the found region's record even when it has no bolt pattern (ARCFOX: chdm, pcd null)", async () => {
    const { svc, calls } = makeRegionService({
      usdm: emptyWithRegions({ chdm: 2 }),
      chdm: record(5, null),
    })
    const f = await svc.getFitment({ make: "arcfox", model: "as6", year: "2025", region: "usdm" })
    expect(f.canonicalBoltPatterns).toEqual([])
    expect(calls.map((c) => c.region)).toEqual(["usdm", "chdm"])
  })

  it("stays not_found when the requested region is empty and no other region has data", async () => {
    const { svc, calls } = makeRegionService({ usdm: emptyWithRegions({}) })
    const f = await svc.getFitment({ make: "ghost", model: "car", year: "2020", region: "usdm" })
    expect(f.status).toBe("not_found")
    expect(calls.map((c) => c.region)).toEqual(["usdm"])
  })

  it("probes most-populated regions first and skips ones lacking a bolt pattern", async () => {
    const { svc, calls } = makeRegionService({
      usdm: emptyWithRegions({ eudm: 5, jdm: 1 }),
      eudm: record(5, null), // most-populated but unusable (no PCD)
      jdm: record(5, 114.3), // real bolt pattern
    })
    const f = await svc.getFitment({ make: "x", model: "y", year: "2021", region: "usdm" })
    expect(f.canonicalBoltPatterns).toContain("5x114.3")
    expect(f.source.region).toBe("jdm")
    expect(calls.map((c) => c.region)).toEqual(["usdm", "eudm", "jdm"]) // eudm (5) before jdm (1)
  })

  it("caches the fallback result under the REQUESTED region (no re-probe on 2nd call)", async () => {
    const { svc, calls } = makeRegionService({
      usdm: emptyWithRegions({ eudm: 2 }),
      eudm: record(5, 120),
    })
    await svc.getFitment({ make: "a", model: "b", year: "2020", region: "usdm" })
    const after = calls.length
    const f2 = await svc.getFitment({ make: "a", model: "b", year: "2020", region: "usdm" })
    expect(calls.length).toBe(after) // served from cache — no new upstream calls
    expect(f2.canonicalBoltPatterns).toContain("5x120")
  })

  it("retries the requested region WITHOUT the trim before crossing markets (US car, non-US trim slug)", async () => {
    const { svc, calls } = makeRegionService({})
    // usdm + a (non-US) trim → empty; usdm without the trim → real 5x112; other
    // regions exist but must NOT be reached because the same-region retry succeeds.
    svc.client_.byModel = async (p: any) => {
      calls.push(p)
      if (p.region === "usdm" && p.modification) return emptyWithRegions({ eudm: 3 })
      if (p.region === "usdm") return record(5, 112)
      return record(4, 100) // eudm/etc — would be wrong for a US car
    }
    const f = await svc.getFitment({ make: "audi", model: "a3", year: "2022", modificationSlug: "eu-trim", region: "usdm" })
    expect(f.canonicalBoltPatterns).toContain("5x112")
    expect(f.source.region).toBe("usdm") // stayed on US data, did not jump to eudm
    expect(calls.map((c) => `${c.region}${c.modification ? "+mod" : ""}`)).toEqual(["usdm+mod", "usdm"])
  })

  it("does not forward the (region-specific) modification slug to fallback probes", async () => {
    const { svc, calls } = makeRegionService({
      usdm: emptyWithRegions({ eudm: 1 }),
      eudm: record(5, 112),
    })
    await svc.getFitment({ make: "m", model: "n", year: "2022", modificationSlug: "usdm-trim", region: "usdm" })
    const eudmCall = calls.find((c) => c.region === "eudm")
    expect(eudmCall.modification).toBeUndefined()
  })
})

describe("WheelSizeService.reverseFitment", () => {
  function makeReverseService(rows: any[]) {
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm" })
    svc.listWheelSizeFitments = async (f: any) => rows.filter((r) => f.status === undefined || r.status === f.status)
    return svc
  }
  const raw = (make: string, model: string) => ({ data: [{ make: { name: make }, model: { name: model }, start_year: 2020, end_year: 2020 }] })

  it("returns cached vehicles whose bolt pattern matches the product and clears the hub", async () => {
    const svc = makeReverseService([
      { status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm: 64, raw: raw("Honda", "Civic") },
      { status: "ok", canonical_bolt_patterns: ["6x139.7"], hub_bore_mm: 100, raw: raw("Ford", "F150") },
    ])
    const out = await svc.reverseFitment({ canonicalBoltPatterns: ["5x114.3"], wheelBoreMm: 70 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ make: "Honda", model: "Civic", boltPattern: "5x114.3" })
  })
})
