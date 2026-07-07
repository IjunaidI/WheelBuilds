// backend/src/modules/wheel-size/__tests__/service.test.ts
import WheelSizeService from "../service"

// Fake `knex_.raw` for the fitment atomic-upsert path (WB-072 B8): parses the JSON
// binds back into JS values (mirroring how Postgres jsonb columns read back through
// MikroORM) and folds them onto the in-memory `store.fitment` map keyed by
// cache_key — the same shape a real `INSERT ... ON CONFLICT DO UPDATE` would leave
// behind for a subsequent `listWheelSizeFitments` read.
function installFitmentKnexStub(svc: any, store: any) {
  svc.knex_ = {
    raw: async (_sql: string, binds: any[] = []) => {
      const [
        id, cache_key, region, raw, canonical_bolt_patterns, hub_bore_mm_x100,
        diameter_window, width_window, offset_window, status, fetched_at,
      ] = binds
      const parse = (v: any) => (v == null ? null : JSON.parse(v))
      const existing = store.fitment.get(cache_key)
      const row = {
        id: existing?.id ?? id,
        cache_key, region,
        raw: parse(raw),
        canonical_bolt_patterns: parse(canonical_bolt_patterns),
        hub_bore_mm_x100,
        diameter_window: parse(diameter_window),
        width_window: parse(width_window),
        offset_window: parse(offset_window),
        status, fetched_at,
      }
      store.fitment.set(cache_key, row)
      return { rows: [row] }
    },
  }
}

function makeService(clientResults: any[], opts: any = {}) {
  let i = 0
  const client = { byModel: async () => clientResults[i++] }
  const store: any = { fitment: new Map(), quota: { day: "", count: 0 } }
  const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
  svc.client_ = client
  // stub the MedusaService-generated methods used by getFitment's cache read
  svc.listWheelSizeFitments = async ({ cache_key }: any) => { const v = store.fitment.get(cache_key); return v ? [v] : [] }
  // refreshFitment now writes via an atomic knex upsert (WB-072 B8), not create/update
  installFitmentKnexStub(svc, store)
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
    expect(store.fitment.get("honda|accord||m|usdm").status).toBe("not_found")
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
  installFitmentKnexStub(svc, store)
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

describe("WheelSizeService.resolveByModel quota exhaustion mid-lookup (WB-072 B4)", () => {
  it("throws QuotaOutageError (not a cached not_found) when quota runs out on the same-region trim-retry", async () => {
    // Primary (usdm + trim) comes back empty, so the trim-retry fires; the quota
    // check for THAT retry is the one exhausted (ceiling: 1 — primary's own check
    // already consumed the only unit).
    const empty = { status: 200, empty: false, body: { data: [] } }
    const { svc, store } = makeService([empty], { ceiling: 1 })
    await expect(
      svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    ).rejects.toThrow(/outage/i)
    expect(store.fitment.size).toBe(0) // no persisted not_found sentinel — this was an outage, not a no-match
  })

  it("throws QuotaOutageError (not a cached not_found) when quota runs out during the region-probe loop", async () => {
    const { svc, calls, store } = makeRegionService(
      { usdm: emptyWithRegions({ eudm: 3 }) },
      { ceiling: 1 } // primary check consumes the only unit; the eudm probe's check fails
    )
    await expect(
      svc.getFitment({ make: "bmw", model: "3-series", year: "2022", region: "usdm" })
    ).rejects.toThrow(/outage/i)
    expect(calls.map((c) => c.region)).toEqual(["usdm"]) // never reached the eudm probe
    expect(store.fitment.size).toBe(0)
  })

  it("returns an already-found result (firstWithData) instead of throwing when quota runs out on a LATER probe iteration", async () => {
    // Primary (usdm) empty; first probe (chdm) returns data WITHOUT a filterable
    // bolt pattern — this sets firstWithData but the loop keeps going looking for
    // a better (bolt-pattern-bearing) match. Quota then runs out before the next
    // probe (jdm) — the earlier chdm result must be returned, not discarded.
    const { svc, calls, store } = makeRegionService(
      {
        usdm: emptyWithRegions({ chdm: 2, jdm: 1 }),
        chdm: record(5, null), // no PCD — not filterable, but IS data
        jdm: record(5, 114.3), // would be filterable, but never reached
      },
      { ceiling: 2 } // primary check + chdm probe check consume both units; jdm's check fails
    )
    const f = await svc.getFitment({ make: "arcfox", model: "as6", year: "2025", region: "usdm" })
    expect(f.status).toBe("ok")
    expect(f.source.region).toBe("chdm")
    expect(f.canonicalBoltPatterns).toEqual([]) // firstWithData had no bolt pattern
    expect(calls.map((c) => c.region)).toEqual(["usdm", "chdm"]) // never reached jdm
    expect(store.fitment.get("arcfox|as6|2025||usdm").status).toBe("ok") // persisted, not an outage
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
      { status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6400, raw: raw("Honda", "Civic") },
      { status: "ok", canonical_bolt_patterns: ["6x139.7"], hub_bore_mm_x100: 10000, raw: raw("Ford", "F150") },
    ])
    const out = await svc.reverseFitment({ canonicalBoltPatterns: ["5x114.3"], wheelBoreMm: 70 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ make: "Honda", model: "Civic", boltPattern: "5x114.3" })
  })
})

describe("WheelSizeService.getFitment hub bore scaling (WB-007)", () => {
  it("stores fractional bore ×100 and reads it back as the exact decimal", async () => {
    const { svc, store } = makeService([
      { status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 67.1 }, wheels: [] } ] } },
    ])
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.hubBoreMm).toBe(67.1)
    expect(store.fitment.get("honda|accord||m|usdm").hub_bore_mm_x100).toBe(6710)
    const again = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(again.hubBoreMm).toBe(67.1) // served from cache, exact
  })
})

describe("WheelSizeService.getFitment TTL / stale-while-revalidate (WB-008)", () => {
  it("serves a fresh cached row without calling the client", async () => {
    const { svc } = makeService([]) // client throws if called (no results)
    const fresh = { cache_key: "honda|accord||m|usdm", status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6410, region: "usdm", fetched_at: new Date(), diameter_window: null, width_window: null, offset_window: null, raw: {} }
    ;(svc as any).listWheelSizeFitments = async () => [fresh]
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.canonicalBoltPatterns).toEqual(["5x114.3"])
  })

  it("serves a STALE cached row immediately AND fires a background refresh", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const stale = { cache_key: "honda|accord||m|usdm", status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6410, region: "usdm", fetched_at: old, diameter_window: null, width_window: null, offset_window: null, raw: {} }
    const { svc } = makeService([{ status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 120, centre_bore: 72.6 }, wheels: [] } ] } }], { ttlDays: 90 })
    ;(svc as any).listWheelSizeFitments = async () => [stale]
    let refreshed = false
    ;(svc as any).refreshFitment = async () => { refreshed = true }
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.canonicalBoltPatterns).toEqual(["5x114.3"]) // stale value served immediately
    await new Promise((r) => setTimeout(r, 0)) // let the fire-and-forget run
    expect(refreshed).toBe(true)
  })
})

describe("WheelSizeService.catalog TTL / stale-while-revalidate (WB-072 B6)", () => {
  function makeCatalogService(fetcherResults: any[], opts: any = {}) {
    let i = 0
    const store: any = { rows: new Map<string, any>() }
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
    svc.listWheelSizeCatalogs = async ({ kind, key }: any) => { const v = store.rows.get(`${kind}|${key}`); return v ? [v] : [] }
    svc.createWheelSizeCatalogs = async (row: any) => { store.rows.set(`${row.kind}|${row.key}`, row); return row }
    svc.updateWheelSizeCatalogs = async (row: any) => {
      const existingKey = [...store.rows.entries()].find(([, v]) => v.id === row.id)?.[0]
      const merged = { ...(existingKey ? store.rows.get(existingKey) : {}), ...row }
      store.rows.set(`${merged.kind}|${merged.key}`, merged)
      return merged
    }
    svc._quotaCount = 0
    svc.incrementAndCheckQuota = async () => { svc._quotaCount++; return svc._quotaCount <= (opts.ceiling ?? 5000) }
    const fetcher = () => Promise.resolve(fetcherResults[i++])
    return { svc, store, fetcher }
  }

  it("serves a fresh cached row without counting quota or calling the fetcher", async () => {
    const { svc, store, fetcher } = makeCatalogService([]) // fetcher would throw (no results) if called
    store.rows.set("makes|all", { id: "c1", kind: "makes", key: "all", payload: ["honda"], fetched_at: new Date() })
    const out = await (svc as any).catalog("makes", "all", fetcher)
    expect(out).toEqual(["honda"])
    expect(svc._quotaCount).toBe(0)
  })

  it("serves a STALE cached row immediately AND refreshes in the background without throwing", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const { svc, store, fetcher } = makeCatalogService([{ status: 200, body: ["honda", "acura"] }], { ttlDays: 90 })
    store.rows.set("makes|all", { id: "c1", kind: "makes", key: "all", payload: ["honda"], fetched_at: old })
    const out = await (svc as any).catalog("makes", "all", fetcher)
    expect(out).toEqual(["honda"]) // stale value served immediately
    await new Promise((r) => setTimeout(r, 0)) // let the fire-and-forget background refresh run
    expect(svc._quotaCount).toBe(1) // background refresh counted quota
    expect(store.rows.get("makes|all").payload).toEqual(["honda", "acura"]) // row overwritten
  })

  it("swallows a background refresh failure (e.g. quota outage) instead of throwing to the caller", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const warnings: string[] = []
    const { svc, store, fetcher } = makeCatalogService([], { ttlDays: 90, ceiling: 0 }) // background quota check always fails
    svc.logger_ = { warn: (m: string) => warnings.push(m), error() {} }
    store.rows.set("makes|all", { id: "c1", kind: "makes", key: "all", payload: ["honda"], fetched_at: old })
    const out = await (svc as any).catalog("makes", "all", fetcher)
    expect(out).toEqual(["honda"]) // stale value still served
    await new Promise((r) => setTimeout(r, 0))
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/background catalog refresh failed/i)
    expect(store.rows.get("makes|all").payload).toEqual(["honda"]) // row NOT overwritten
  })

  it("cache miss is unchanged: counts quota and fetches", async () => {
    const { svc, fetcher } = makeCatalogService([{ status: 200, body: ["honda"] }])
    const out = await (svc as any).catalog("makes", "all", fetcher)
    expect(out).toEqual(["honda"])
    expect(svc._quotaCount).toBe(1)
  })
})

describe("WheelSizeService.incrementAndCheckQuota (WB-020)", () => {
  function makeQuotaService(returnedCount: number, ceiling = 5000) {
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", dailyCeiling: ceiling })
    const calls: string[] = []
    const bindings: any[][] = []
    svc.knex_ = { raw: async (sql: string, binds?: any[]) => { calls.push(sql); bindings.push(binds ?? []); return { rows: [{ count: returnedCount }] } } }
    return { svc, calls, bindings }
  }
  it("returns true when the atomic count is at/under the ceiling", async () => {
    const { svc, calls, bindings } = makeQuotaService(4999, 5000)
    expect(await svc.incrementAndCheckQuota()).toBe(true)
    expect(calls[0]).toMatch(/insert into "wheel_size_quota"[\s\S]*on conflict[\s\S]*count = "wheel_size_quota"\."count" \+ 1[\s\S]*returning "count"/i)
    expect(bindings[0]).toHaveLength(2)
    expect(bindings[0][0]).toMatch(/^wsq_\d{8}$/) // id = wsq_ + YYYYMMDD
    expect(bindings[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/) // day = GMT YYYY-MM-DD
  })
  it("returns false when the atomic count exceeds the ceiling", async () => {
    const { svc } = makeQuotaService(5001, 5000)
    expect(await svc.incrementAndCheckQuota()).toBe(false)
  })
  it("returns true when the atomic count exactly equals the ceiling", async () => {
    const { svc } = makeQuotaService(5000, 5000)
    expect(await svc.incrementAndCheckQuota()).toBe(true)
  })
})

describe("WheelSizeService.refreshFitment atomic upsert (WB-072 B8)", () => {
  // Bare service with a capturing knex_.raw stub (no store side-effects) so we can
  // inspect the exact SQL/binds a single refreshFitment call issues.
  function makeCapturingService(body: any, opts: any = {}) {
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm", ...opts })
    svc.client_ = { byModel: async () => ({ status: 200, empty: false, body }) }
    svc.incrementAndCheckQuota = async () => true
    const calls: { sql: string; binds: any[] }[] = []
    svc.knex_ = { raw: async (sql: string, binds: any[] = []) => { calls.push({ sql, binds }); return { rows: [] } } }
    return { svc, calls }
  }

  const wheelBody = { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 64.1 }, wheels: [] }] }

  it("issues a single atomic INSERT ... ON CONFLICT (cache_key) upsert — no separate list/create/update calls", async () => {
    const { svc, calls } = makeCapturingService(wheelBody)
    svc.listWheelSizeFitments = async () => { throw new Error("must not be called by refreshFitment") }
    svc.createWheelSizeFitments = async () => { throw new Error("must not be called by refreshFitment") }
    svc.updateWheelSizeFitments = async () => { throw new Error("must not be called by refreshFitment") }

    await svc.refreshFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })

    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toMatch(/insert into "wheel_size_fitment"[\s\S]*on conflict \("cache_key"\) where deleted_at is null[\s\S]*do update set/i)
  })

  it("generates a wsf_-prefixed id and JSON-stringifies the jsonb columns for the bind", async () => {
    const { svc, calls } = makeCapturingService(wheelBody)
    await svc.refreshFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })

    const [
      id, cache_key, region, raw, canonical_bolt_patterns, hub_bore_mm_x100,
      diameter_window, width_window, offset_window, status, fetched_at,
    ] = calls[0].binds
    expect(id).toMatch(/^wsf_[0-9A-Z]{26}$/) // wsf_ + ULID, mirrors wsq_ convention
    expect(cache_key).toBe("honda|accord||m|usdm")
    expect(region).toBe("usdm")
    expect(JSON.parse(raw)).toEqual(wheelBody) // arrays/objects must be pre-stringified for ::jsonb
    expect(JSON.parse(canonical_bolt_patterns)).toEqual(["5x114.3"])
    expect(hub_bore_mm_x100).toBe(6410) // plain integer bind, not JSON-encoded
    expect(diameter_window).toBeNull()
    expect(width_window).toBeNull()
    expect(offset_window).toBeNull()
    expect(status).toBe("ok")
    expect(fetched_at).toBeInstanceOf(Date)
  })

  it("two concurrent cache misses on the same cache_key each resolve via their own atomic upsert instead of racing a unique-violation", async () => {
    // Simulate the real race: both calls build a row for the same cache_key with no
    // read in between (list-then-create is gone), so each independently calls
    // knex_.raw once. A real ON CONFLICT DO UPDATE folds the loser in; here we assert
    // the service-level behavior that made the race possible is gone — there is no
    // shared "existing" read/branch between the two refreshFitment calls at all.
    const store = new Map<string, any>()
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", defaultRegion: "usdm" })
    svc.client_ = { byModel: async () => ({ status: 200, empty: false, body: wheelBody }) }
    svc.incrementAndCheckQuota = async () => true
    installFitmentKnexStub(svc, { fitment: store })

    const p = { make: "honda", model: "accord", modificationSlug: "m", region: "usdm" }
    const [a, b] = await Promise.all([svc.refreshFitment(p), svc.refreshFitment(p)])

    expect(a.status).toBe("ok")
    expect(b.status).toBe("ok")
    expect(store.size).toBe(1) // both upserts folded onto the single cache_key row
  })
})
