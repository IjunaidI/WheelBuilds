import { finalizeApply } from "../pipeline/finalize-apply"

function makeService(priorRuns: any[] = []) {
  return {
    updates: [] as any[],
    async listVendorFeedRuns() {
      return priorRuns
    },
    async updateVendorFeedRuns(data: any) {
      this.updates.push(data)
      return data
    },
  }
}

const ok = { processedCount: 1, groupCount: 1, errorCount: 0, errors: [], cancelled: false }
const partial = {
  processedCount: 0,
  groupCount: 0,
  errorCount: 1,
  errors: [{ groupKey: "g1", error: "boom" }],
  cancelled: false,
}

describe("finalizeApply", () => {
  it("marks a clean apply completed and clears failure columns", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: new Date("2026-06-08"), result: ok, maxAttempts: 3,
    })
    expect(out.status).toBe("completed")
    expect(svc.updates[0]).toMatchObject({
      id: "run_1", status: "completed", failed_part_numbers: null, failed_group_keys: null, apply_attempt_count: 1,
    })
  })

  it("marks a first partial failure partially_failed with attempt 1", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: new Date("2026-06-08"), result: partial, maxAttempts: 3,
    })
    expect(out.status).toBe("partially_failed")
    expect(svc.updates[0]).toMatchObject({
      status: "partially_failed", apply_attempt_count: 1, failed_group_keys: ["g1"],
    })
  })

  it("escalates to exhausted at the attempt cap (carrying prior same-feed attempts)", async () => {
    const svc = makeService([
      { id: "old", run_date_vendor: "2026-06-08", apply_attempt_count: 2 },
    ])
    const out = await finalizeApply(svc as any, {
      runId: "run_2", vendorCode: "v", feedDate: new Date("2026-06-08"), result: partial, maxAttempts: 3,
    })
    expect(out.attempt).toBe(3)
    expect(out.status).toBe("exhausted")
  })

  it("on cancellation only records partial-progress failures (no status change)", async () => {
    const svc = makeService()
    const out = await finalizeApply(svc as any, {
      runId: "run_1", vendorCode: "v", feedDate: null,
      result: { ...partial, cancelled: true }, maxAttempts: 3,
    })
    expect(out.status).toBe("cancelled")
    expect(svc.updates[0]).toMatchObject({ id: "run_1", failed_group_keys: ["g1"] })
    expect(svc.updates[0].status).toBeUndefined()
  })
})
