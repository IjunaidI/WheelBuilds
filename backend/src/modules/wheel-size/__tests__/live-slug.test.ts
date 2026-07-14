// Live wheel-size by_model slug check. SKIPPED by default so `pnpm test:fitment`
// stays offline. Run against the real API with:
//   RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=<key> pnpm test:fitment -- live-slug
import { WheelSizeClient } from "../client"

const RUN = process.env.RUN_WHEEL_SIZE_LIVE === "true" && !!process.env.WHEEL_SIZE_API_KEY
const d = RUN ? describe : describe.skip

d("wheel-size live by_model slug resolution (WB-043)", () => {
  it("resolves a known YMM slug to fitment with a usable bolt pattern", async () => {
    const c = new WheelSizeClient({
      apiKey: process.env.WHEEL_SIZE_API_KEY as string,
      baseUrl: process.env.WHEEL_SIZE_BASE_URL ?? "https://api.wheel-size.com/v2",
      timeoutMs: 10000,
    })
    const r = await c.byModel({ make: "honda", model: "accord", year: "2021", region: "usdm" })
    expect(r.status).toBe(200)
    const tech = r.body?.data?.[0]?.technical
    expect(typeof tech?.stud_holes).toBe("number")
    expect(typeof tech?.pcd).toBe("number")
  }, 15000)
})

// WB-104 T4 — pin the `/modifications/` slug contract the storefront drawer's
// `toOptions` relies on (find-by-vehicle/to-options.ts): the option VALUE sent
// on to `by_model`'s `modification` param must be a real wheel-size slug, not
// the display name. If wheel-size ever stopped emitting `slug` on modification
// items, `toOptions` would silently fall back to `name` and trim narrowing
// would break without any test noticing — these two live checks catch that.
d("wheel-size live /modifications/ slug contract (WB-104 T4)", () => {
  const c = new WheelSizeClient({
    apiKey: process.env.WHEEL_SIZE_API_KEY as string,
    baseUrl: process.env.WHEEL_SIZE_BASE_URL ?? "https://api.wheel-size.com/v2",
    timeoutMs: 10000,
  })

  it("every /modifications/ item exposes a string slug", async () => {
    const r = await c.modifications("honda", "accord", "2021", "usdm")
    expect(r.status).toBe(200)
    const items = r.body?.data
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(typeof item.slug).toBe("string")
      expect(item.slug.length).toBeGreaterThan(0)
    }
  }, 15000)

  it("a by_model lookup narrowed by one of those slugs returns non-empty data whose entries all carry that trim", async () => {
    const modsRes = await c.modifications("honda", "accord", "2021", "usdm")
    expect(modsRes.status).toBe(200)
    const items = modsRes.body?.data
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)
    const target = items[0]

    const byModelRes = await c.byModel({
      make: "honda",
      model: "accord",
      year: "2021",
      modification: target.slug,
      region: "usdm",
    })
    expect(byModelRes.status).toBe(200)
    const data = byModelRes.body?.data
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    // Per the Task-1 findings (docs/done/specs/2026-05-30-wheel-size-task1-findings.md
    // §2), the modification slug also lands on each by_model entry at `data[].slug`
    // — the same identifier used to narrow the query. Every returned entry must
    // echo it back, and each must carry a non-empty `.trim` (the field
    // `extractVehicleIdentity` reads), confirming the narrowed result really is
    // "that trim" and not the full unnarrowed trim list.
    for (const entry of data) {
      expect(entry.slug).toBe(target.slug)
      expect(typeof entry.trim).toBe("string")
      expect(entry.trim.length).toBeGreaterThan(0)
    }
    const trims = new Set(data.map((e: any) => e.trim))
    expect(trims.size).toBe(1)
  }, 20000)
})
