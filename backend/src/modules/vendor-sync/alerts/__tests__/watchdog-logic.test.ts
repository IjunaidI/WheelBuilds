import {
  AlertableRun,
  selectFailedRuns,
  selectStaleVendors,
} from "../watchdog-logic"

const NOW = Date.parse("2026-07-11T12:00:00Z")
const HOUR = 60 * 60 * 1000
const WINDOW = 65 * 60 * 1000
const MAX_AGE = 26 * HOUR

const run = (over: Partial<AlertableRun>): AlertableRun => ({
  id: "run_1",
  vendor_code: "wheelpros-wheels",
  status: "completed",
  mode: "full",
  finished_at: new Date(NOW - HOUR),
  ...over,
})

describe("selectFailedRuns", () => {
  it("selects failure statuses that finished inside the window", () => {
    const runs = [
      run({ id: "a", status: "failed", finished_at: new Date(NOW - 10 * 60 * 1000) }),
      run({ id: "b", status: "partially_failed", finished_at: new Date(NOW - 60 * 60 * 1000) }),
      run({ id: "c", status: "exhausted", finished_at: new Date(NOW - 30 * 60 * 1000) }),
    ]
    expect(selectFailedRuns(runs, { now: NOW, windowMs: WINDOW }).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("ignores failures older than the window (already alerted by a prior tick)", () => {
    const runs = [run({ status: "failed", finished_at: new Date(NOW - 2 * HOUR) })]
    expect(selectFailedRuns(runs, { now: NOW, windowMs: WINDOW })).toEqual([])
  })

  it("ignores non-failure terminal statuses (completed, cancelled, superseded, awaiting_approval)", () => {
    const runs = ["completed", "cancelled", "superseded", "awaiting_approval", "applying"].map(
      (status, i) => run({ id: `r${i}`, status, finished_at: new Date(NOW - 5 * 60 * 1000) })
    )
    expect(selectFailedRuns(runs, { now: NOW, windowMs: WINDOW })).toEqual([])
  })

  it("ignores failure rows with no finished_at (still in flight / never landed)", () => {
    const runs = [run({ status: "failed", finished_at: null })]
    expect(selectFailedRuns(runs, { now: NOW, windowMs: WINDOW })).toEqual([])
  })

  it("accepts ISO-string finished_at (driver may hydrate either shape)", () => {
    const runs = [
      run({ status: "failed", finished_at: new Date(NOW - 10 * 60 * 1000).toISOString() }),
    ]
    expect(selectFailedRuns(runs, { now: NOW, windowMs: WINDOW })).toHaveLength(1)
  })
})

describe("selectStaleVendors", () => {
  const V1 = "wheelpros-wheels"
  const V2 = "wheelpros-tires"

  it("healthy: a completed FULL run inside the horizon", () => {
    const runs = [run({ vendor_code: V1, finished_at: new Date(NOW - 12 * HOUR) })]
    expect(selectStaleVendors(runs, [V1], { now: NOW, maxAgeMs: MAX_AGE })).toEqual([])
  })

  it("stale: newest full success is older than the horizon", () => {
    const runs = [run({ vendor_code: V1, finished_at: new Date(NOW - 30 * HOUR) })]
    const stale = selectStaleVendors(runs, [V1], { now: NOW, maxAgeMs: MAX_AGE })
    expect(stale).toEqual([
      { vendorCode: V1, lastFullSuccessAt: NOW - 30 * HOUR },
    ])
  })

  it("stale with null when the vendor has no completed full run at all", () => {
    expect(selectStaleVendors([], [V1], { now: NOW, maxAgeMs: MAX_AGE })).toEqual([
      { vendorCode: V1, lastFullSuccessAt: null },
    ])
  })

  it("stock-only successes do NOT count as freshness (full feed could be dead)", () => {
    const runs = [
      run({ vendor_code: V1, mode: "stock", finished_at: new Date(NOW - HOUR) }),
      run({ vendor_code: V1, mode: "full", finished_at: new Date(NOW - 30 * HOUR) }),
    ]
    expect(selectStaleVendors(runs, [V1], { now: NOW, maxAgeMs: MAX_AGE })).toHaveLength(1)
  })

  it("failed runs do not count as freshness; only checks ENABLED vendors", () => {
    const runs = [
      run({ vendor_code: V1, status: "failed", finished_at: new Date(NOW - HOUR) }),
      run({ vendor_code: V2, finished_at: new Date(NOW - HOUR) }),
    ]
    const stale = selectStaleVendors(runs, [V1, V2], { now: NOW, maxAgeMs: MAX_AGE })
    expect(stale.map((s) => s.vendorCode)).toEqual([V1])
  })

  it("a missing mode counts as full (legacy rows predate the mode column default)", () => {
    const runs = [run({ vendor_code: V1, mode: null, finished_at: new Date(NOW - HOUR) })]
    expect(selectStaleVendors(runs, [V1], { now: NOW, maxAgeMs: MAX_AGE })).toEqual([])
  })
})
