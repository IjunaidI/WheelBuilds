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
