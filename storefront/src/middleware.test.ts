// storefront/src/middleware.test.ts
//
// WB-095 Task 4 review fix -- Critical: an emergent loop between two
// middleware rules whenever `regionMap.has(DEFAULT_REGION)` is false.
//
// `regionRedirectTarget` (region-redirect.ts) is a pure function with no
// region-map parameter, so no unit test of IT can ever exercise this bug --
// it only emerges from the interaction between the new WB-095 X2 redirect
// block and the pre-existing `getCountryCode` fallback chain, both living in
// `middleware()` itself. That interaction is exactly what this file drives:
// a real `NextRequest` through the real exported `middleware()` function,
// with only `global.fetch` (the Edge-safe fetch to `/store/regions`) mocked.
//
// The loop, concretely (DEFAULT_REGION="us", but "us" absent from the
// region map -- e.g. a stock `pnpm seed` bootstrap without vendor-sync
// enabled, per seed.ts's Europe-only default):
//   1. getCountryCode's `regionMap.has(DEFAULT_REGION)` is false, so it falls
//      back to `regionMap.keys().next().value` (the first seeded region,
//      e.g. "gb").
//   2. A request for `/us/store` has `urlHasCountryCode` false (fallback
//      code "gb" != url code "us"), so the existing 307 rule sends it to
//      `/gb/store`.
//   3. The WB-095 X2 rule sees `gb !== "us"` and 301s back toward
//      `/us/store` -- UNLESS it's guarded on the destination being
//      resolvable, which is the fix under test here.
// Without the guard, step 3 fires and the two rules ping-pong forever with a
// growing path. With the guard (`regionMap.has(DEFAULT_REGION)`), the X2
// rule disables itself whenever DEFAULT_REGION can't be resolved, and
// control reverts to the pre-WB-095-X2 behavior (a single 307 into the
// first available region, terminal).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const ORIGINAL_ENV = { ...process.env }

function stubRegionsFetch(regionSpecs: Array<{ id: string; countries: string[] }>) {
  const body = {
    regions: regionSpecs.map((r) => ({
      id: r.id,
      countries: r.countries.map((iso_2) => ({ iso_2 })),
    })),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    })
  )
}

/** Follow one middleware hop at a time, mirroring what a browser's `-L`
 * would do -- only ever re-enters `middleware()` itself (never a real
 * network stack), so this can detect a genuine infinite loop without
 * needing a live server. Caps at `maxHops`; when the bug is present the
 * cap is what stops it (the loop never resolves `location` to null on its
 * own), so a hop count that hits the cap IS the failure signature. Verified
 * against this exact test with the fix reverted: the returned hops matched
 * the reviewer's transcript verbatim --
 *   /us/store -> 307 /gb/us/store -> 301 /us/us/store -> 307 /gb/us/us/store -> ...
 * (a GROWING path, never a literal repeat -- ruling out "assert no repeated
 * path" as the discriminator; only the bounded-termination assertion below
 * actually catches this). */
async function traceHops(
  middlewareFn: (req: NextRequest) => Promise<any>,
  startPath: string,
  maxHops = 8
) {
  const hops: Array<{ path: string; status: number; location: string | null }> = []
  let path = startPath
  for (let i = 0; i < maxHops; i++) {
    const res = await middlewareFn(
      new NextRequest(new Request(`http://localhost${path}`))
    )
    const location = res.headers.get("location")
    hops.push({ path, status: res.status, location })
    if (!location) break // NextResponse.next() -- terminal, request passes through
    path = new URL(location, "http://localhost").pathname
  }
  return hops
}

describe("middleware -- region-redirect vs getCountryCode-fallback loop guard (review fix)", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://backend.test"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...ORIGINAL_ENV }
  })

  it("terminates (does not loop) when DEFAULT_REGION ('us') is absent from a Europe-only region map -- stock-seed bootstrap without vendor-sync", async () => {
    delete process.env.NEXT_PUBLIC_DEFAULT_REGION // -> "us" default, middleware.ts:8
    stubRegionsFetch([
      { id: "reg_eur", countries: ["gb", "de", "dk", "se", "fr", "es", "it"] },
    ])

    const { middleware } = await import("./middleware")

    const hops = await traceHops(middleware, "/us/store")

    // GREEN (fix in place): terminates in 2 hops -- 307 into the first
    // available region ("gb"), then NextResponse.next() once there.
    // RED (fix reverted, verified by hand): hits the 8-hop cap with the
    // path growing every time, reproducing the reviewer's transcript
    // verbatim: /us/store -> 307 /gb/us/store -> 301 /us/us/store ->
    // 307 /gb/us/us/store -> 301 /us/us/us/store -> ... (unbounded).
    expect(hops.length).toBeLessThanOrEqual(3)
    expect(hops[hops.length - 1].location).toBeNull() // terminal: NextResponse.next()
  })

  it("terminates (does not loop) when NEXT_PUBLIC_DEFAULT_REGION is misconfigured (e.g. 'usa') even though both real regions are present -- trigger (c)", async () => {
    process.env.NEXT_PUBLIC_DEFAULT_REGION = "usa"
    stubRegionsFetch([
      { id: "reg_eur", countries: ["gb", "de", "dk", "se", "fr", "es", "it"] },
      { id: "reg_us", countries: ["us"] },
    ])

    const { middleware } = await import("./middleware")

    const hops = await traceHops(middleware, "/store")

    // Same shape as trigger (a)/(b) above: "usa" is never a key in the
    // region map (it fails the pure function's own `^[a-z]{2}$` source
    // test on top of that), so `regionMap.has(DEFAULT_REGION)` is false and
    // the X2 rule disables itself here too.
    expect(hops.length).toBeLessThanOrEqual(3)
    expect(hops[hops.length - 1].location).toBeNull()
  })

  it("control: still 301s /de/store -> /us/store when DEFAULT_REGION ('us') IS resolvable -- the guard must not disable the WB-095 X2 rule in the normal case", async () => {
    delete process.env.NEXT_PUBLIC_DEFAULT_REGION
    stubRegionsFetch([
      { id: "reg_eur", countries: ["gb", "de", "dk", "se", "fr", "es", "it"] },
      { id: "reg_us", countries: ["us"] },
    ])

    const { middleware } = await import("./middleware")

    const res = await middleware(
      new NextRequest(new Request("http://localhost/de/store?q=x"))
    )
    expect(res.status).toBe(301)
    expect(res.headers.get("location")).toBe("http://localhost/us/store?q=x")

    const res2 = await middleware(
      new NextRequest(new Request("http://localhost/us/store"))
    )
    expect(res2.headers.get("location")).toBeNull() // NextResponse.next() -- no redirect
  })
})
