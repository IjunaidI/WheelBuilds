// Live wheel-size by_model slug check. SKIPPED by default so `pnpm test:fitment`
// stays offline. Run against the real API with:
//   RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=<key> pnpm test:fitment -- live-slug
import { WheelSizeClient } from "../client"
import { subModelsForModelYear } from "../sub-models"

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

// WB-113 T1 — de-risk the sub-model (marketing trim, e.g. "L"/"LE"/"LE Eco")
// feature BEFORE building the service/UI on top of it: confirm `trim_levels`
// is really on both endpoints we read, for a spread of vehicle shapes. Run
// sparingly — the API is quota-metered. Real results go in
// `.superpowers/sdd/task-1-report.md` verbatim (this is the whole point of
// the probe: report what the API actually returns, don't assume).
d("wheel-size live trim_levels coverage probe (WB-113 T1)", () => {
  const c = new WheelSizeClient({
    apiKey: process.env.WHEEL_SIZE_API_KEY as string,
    baseUrl: process.env.WHEEL_SIZE_BASE_URL ?? "https://api.wheel-size.com/v2",
    timeoutMs: 10000,
  })

  it("Corolla 2019/usdm: trim_levels present on /modifications AND /search/by_model/, union non-empty", async () => {
    const mods = await c.modifications("toyota", "corolla", "2019", "usdm")
    expect(mods.status).toBe(200)
    const modItems = mods.body?.data ?? []
    console.log("[WB-113 probe] corolla 2019 /modifications entries:", JSON.stringify(modItems, null, 2))
    expect(Array.isArray(modItems)).toBe(true)
    expect(modItems.length).toBeGreaterThan(0)

    const byModel = await c.byModel({ make: "toyota", model: "corolla", year: "2019", region: "usdm" })
    expect(byModel.status).toBe(200)
    const entries = byModel.body?.data ?? []
    console.log(
      "[WB-113 probe] corolla 2019 /search/by_model/ entries (engine + trim_levels only):",
      JSON.stringify(entries.map((e: any) => ({ name: e.name, trim: e.trim, trim_levels: e.trim_levels })), null, 2)
    )
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)

    const union = subModelsForModelYear(entries)
    console.log("[WB-113 probe] corolla 2019 subModelsForModelYear union:", JSON.stringify(union))
    expect(union.length).toBeGreaterThan(0)
  }, 20000)

  it("Silverado 1500 (recent year)/usdm: trim_levels present, expect overlap across gas/diesel engine entries", async () => {
    const mods = await c.modifications("chevrolet", "silverado-1500", "2023", "usdm")
    console.log("[WB-113 probe] silverado-1500 2023 /modifications status:", mods.status)
    const modItems = mods.body?.data ?? []
    console.log("[WB-113 probe] silverado-1500 2023 /modifications entries:", JSON.stringify(modItems, null, 2))

    const byModel = await c.byModel({ make: "chevrolet", model: "silverado-1500", year: "2023", region: "usdm" })
    expect(byModel.status).toBe(200)
    const entries = byModel.body?.data ?? []
    console.log(
      "[WB-113 probe] silverado-1500 2023 /search/by_model/ entries (engine + trim_levels only):",
      JSON.stringify(entries.map((e: any) => ({ name: e.name, trim: e.trim, trim_levels: e.trim_levels })), null, 2)
    )
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)

    const union = subModelsForModelYear(entries)
    console.log("[WB-113 probe] silverado-1500 2023 subModelsForModelYear union:", JSON.stringify(union))
    expect(union.length).toBeGreaterThan(0)

    // Report (not assert — this is genuinely an open question) whether any
    // single sub-model spans more than one engine entry.
    const counts = new Map<string, number>()
    for (const e of entries) for (const t of e.trim_levels ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    const spanning = [...counts.entries()].filter(([, n]) => n > 1)
    console.log("[WB-113 probe] silverado-1500 2023 sub-models spanning >1 engine entry:", JSON.stringify(spanning))
  }, 20000)

  it("a vehicle chosen to probe for EMPTY trim_levels: reports whatever the API actually returns", async () => {
    // Exotic low-volume supercar — a candidate for "no marketing sub-model
    // catalog", since each model year is usually a single configuration.
    const mods = await c.modifications("bugatti", "chiron", "2018", "usdm")
    console.log("[WB-113 probe] bugatti chiron 2018 /modifications status:", mods.status)
    const modItems = mods.body?.data ?? []
    console.log("[WB-113 probe] bugatti chiron 2018 /modifications entries:", JSON.stringify(modItems, null, 2))

    const byModel = await c.byModel({ make: "bugatti", model: "chiron", year: "2018", region: "usdm" })
    console.log("[WB-113 probe] bugatti chiron 2018 /search/by_model/ status:", byModel.status)
    const entries = byModel.body?.data ?? []
    console.log(
      "[WB-113 probe] bugatti chiron 2018 /search/by_model/ entries (engine + trim_levels only):",
      JSON.stringify(entries.map((e: any) => ({ name: e.name, trim: e.trim, trim_levels: e.trim_levels })), null, 2)
    )
    const union = subModelsForModelYear(entries)
    console.log("[WB-113 probe] bugatti chiron 2018 subModelsForModelYear union:", JSON.stringify(union))
    // No hard assertion on non-empty here by design — the point of this case
    // is to OBSERVE whether trim_levels can legitimately be empty, and report it.
  }, 20000)
})
