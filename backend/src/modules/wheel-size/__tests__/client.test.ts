// backend/src/modules/wheel-size/__tests__/client.test.ts
import { WheelSizeClient } from "../client"

describe("WheelSizeClient", () => {
  it("reports status and empty-body for a quota-exhausted (403 empty) response", async () => {
    const fakeFetch = async () => ({ status: 403, text: async () => "" }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(403)
    expect(r.empty).toBe(true)
    expect(r.body).toBeNull()
  })

  it("parses a 200 body", async () => {
    const fakeFetch = async () => ({ status: 200, text: async () => JSON.stringify({ data: [{ technical: { pcd: 114.3, stud_holes: 5 } }] }) }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(200)
    expect(r.empty).toBe(false)
    expect(r.body?.data?.[0]?.technical?.pcd).toBe(114.3)
  })
})
