// backend/src/modules/wheel-size/__tests__/client.test.ts
import { WheelSizeClient } from "../client"

describe("WheelSizeClient", () => {
  it("reports status and empty-body for a quota-exhausted (403 empty) response", async () => {
    const fakeFetch = async () => ({ status: 403, text: async () => "" }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ make: "mitsubishi", model: "outlander", modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(403)
    expect(r.empty).toBe(true)
    expect(r.body).toBeNull()
  })

  it("parses a 200 body", async () => {
    const fakeFetch = async () => ({ status: 200, text: async () => JSON.stringify({ data: [{ technical: { pcd: 114.3, stud_holes: 5 } }] }) }) as any
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    const r = await c.byModel({ make: "mitsubishi", model: "outlander", modification: "accord-2021", region: "usdm" })
    expect(r.status).toBe(200)
    expect(r.empty).toBe(false)
    expect(r.body?.data?.[0]?.technical?.pcd).toBe(114.3)
  })

  // wheel-size v2 /search/by_model/ REJECTS (400 VALIDATION_ERROR) unless `year`
  // (or `generation`) is present; `modification` only narrows the trim and does
  // NOT satisfy the requirement. So year must be sent even when a modification is
  // also provided — the old `else if` dropped it and broke every fitment lookup.
  it("sends year in the by_model query even when a modification is also provided", async () => {
    let captured = ""
    const fakeFetch = async (url: string) => {
      captured = url
      return { status: 200, text: async () => "{}" } as any
    }
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: fakeFetch })
    await c.byModel({ make: "abarth", model: "500", modification: "836bce4e66", year: "2008", region: "usdm" })
    const qs = new URL(captured).searchParams
    expect(qs.get("year")).toBe("2008")
    expect(qs.get("modification")).toBe("836bce4e66")
    expect(qs.get("make")).toBe("abarth")
    expect(qs.get("model")).toBe("500")
  })

  it("returns 408 when the fetch exceeds the timeout", async () => {
    const neverResolves = () => new Promise<any>(() => {}) // hangs
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: neverResolves, timeoutMs: 20 })
    const r = await c.byModel({ make: "x", model: "y", year: "2020", region: "usdm" })
    expect(r.status).toBe(408)
    expect(r.empty).toBe(true)
    expect(r.body).toBeNull()
  })

  it("returns 408 and swallows the orphaned fetch's abort rejection when the timeout wins", async () => {
    // A fetch that hangs until its signal aborts, then REJECTS (like Node's real fetch).
    const abortRejectingFetch = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<any>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("AbortError")))
      })
    const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: abortRejectingFetch as any, timeoutMs: 20 })
    const r = await c.byModel({ make: "x", model: "y", year: "2020", region: "usdm" })
    expect(r.status).toBe(408)
    // let the orphaned rejection settle on the microtask queue — must not crash the run
    await new Promise((res) => setTimeout(res, 5))
  })
})
