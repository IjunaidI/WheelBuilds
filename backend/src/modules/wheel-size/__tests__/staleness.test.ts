import { isStale, selectStaleForWarm } from "../staleness"

const now = new Date("2026-06-23T00:00:00Z")
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

describe("isStale", () => {
  it("is fresh within the TTL", () => {
    expect(isStale(daysAgo(10), 90, now)).toBe(false)
  })
  it("is stale past the TTL", () => {
    expect(isStale(daysAgo(91), 90, now)).toBe(true)
  })
  it("treats exactly-at-TTL as fresh (strict older-than)", () => {
    expect(isStale(daysAgo(90), 90, now)).toBe(false)
  })
  it("accepts an ISO string", () => {
    expect(isStale(daysAgo(100).toISOString(), 90, now)).toBe(true)
  })
  it("treats missing/invalid fetched_at as stale", () => {
    expect(isStale(null, 90, now)).toBe(true)
    expect(isStale(undefined, 90, now)).toBe(true)
    expect(isStale("not-a-date", 90, now)).toBe(true)
  })
})

describe("selectStaleForWarm", () => {
  it("returns only stale rows, oldest-first, capped at batch", () => {
    const rows = [
      { id: "fresh", fetched_at: daysAgo(1) },
      { id: "old", fetched_at: daysAgo(120) },
      { id: "older", fetched_at: daysAgo(200) },
      { id: "stale", fetched_at: daysAgo(91) },
    ]
    const out = selectStaleForWarm(rows, 90, now, 2)
    expect(out.map((r) => r.id)).toEqual(["older", "old"])
  })
})
