import {
  isVendorBusy,
  isRunSuperseded,
  canApprove,
  BLOCKING_STATUSES,
} from "../pipeline/lifecycle-guards"

describe("isVendorBusy", () => {
  it("is true when another run is applying", () => {
    expect(isVendorBusy([{ id: "a", status: "applying" }], "b")).toBe(true)
  })
  it("excludes the run under test", () => {
    expect(isVendorBusy([{ id: "a", status: "applying" }], "a")).toBe(false)
  })
  it("ignores terminal + awaiting_approval statuses", () => {
    expect(
      isVendorBusy(
        [{ id: "a", status: "completed" }, { id: "c", status: "awaiting_approval" }],
        "b"
      )
    ).toBe(false)
  })
})

describe("isRunSuperseded", () => {
  const base = { id: "r1", status: "awaiting_approval", run_date_vendor: "2026-01-01" }
  it("is true when a completed run has a newer feed date", () => {
    expect(
      isRunSuperseded(base, [{ id: "r2", status: "completed", run_date_vendor: "2026-02-01" }])
    ).toBe(true)
  })
  it("is false when the newer run is not completed", () => {
    expect(
      isRunSuperseded(base, [{ id: "r2", status: "applying", run_date_vendor: "2026-02-01" }])
    ).toBe(false)
  })
  it("is false when this run has no feed date", () => {
    expect(
      isRunSuperseded({ ...base, run_date_vendor: null }, [
        { id: "r2", status: "completed", run_date_vendor: "2026-02-01" },
      ])
    ).toBe(false)
  })
})

describe("canApprove", () => {
  it("is true only for awaiting_approval with no cancel", () => {
    expect(canApprove({ id: "r", status: "awaiting_approval", cancel_requested_at: null })).toBe(true)
    expect(canApprove({ id: "r", status: "cancelled", cancel_requested_at: null })).toBe(false)
    expect(canApprove({ id: "r", status: "awaiting_approval", cancel_requested_at: "2026-01-01" })).toBe(false)
  })
})

describe("BLOCKING_STATUSES", () => {
  it("includes awaiting_approval", () => {
    expect(BLOCKING_STATUSES).toContain("awaiting_approval")
  })
})
