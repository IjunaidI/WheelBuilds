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
    const { svc, store } = makeService([{ status: 200, empty: false, body: { data: [] } }])
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
