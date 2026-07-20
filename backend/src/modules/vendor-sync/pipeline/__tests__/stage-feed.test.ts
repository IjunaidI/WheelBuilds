import { stageFeed, StageImageCheckOptions } from "../stage"
import { ImageReachabilityChecker } from "../image-reachability"
import { VendorAdapter, ParsedRow, WheelNormalizedRecord } from "../../adapters/types"

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

/** Fake VendorSyncService double -- same pattern as finalize-apply.test.ts. */
function makeFakeService() {
  const feedStagingRows: any[] = []
  const stockStagingRows: any[] = []
  const runUpdates: any[] = []
  return {
    feedStagingRows,
    stockStagingRows,
    runUpdates,
    async createVendorFeedStagings(rows: any[]) {
      feedStagingRows.push(...rows)
      return rows
    },
    async createVendorStockStagings(rows: any[]) {
      stockStagingRows.push(...rows)
      return rows
    },
    async updateVendorFeedRuns(data: any) {
      runUpdates.push(data)
      return data
    },
  }
}

/** Minimal but fully-shaped WheelNormalizedRecord, one per partNumber. */
function makeNormalized(
  partNumber: string,
  overrides: Partial<WheelNormalizedRecord> = {}
): WheelNormalizedRecord {
  return {
    partNumber,
    vendorCode: "test-vendor",
    title: `Test Wheel ${partNumber}`,
    brand: "TestBrand",
    imageUrl: `https://vendor.example/${partNumber}.jpg`,
    invOrderType: "X",
    totalQoh: 10,
    msrpUsd: 369.99,
    mapUsd: 300,
    runDateVendor: new Date("2026-07-01"),
    stockByWarehouse: { WH1: 10 },
    groupKey: `group-${partNumber}`,
    productType: "wheel",
    displayStyleNo: "STY1",
    finish: "Black",
    diameterIn: 18,
    widthIn: 8,
    boltCount: 5,
    boltCircleIn: 4.5,
    boltPatternRaw: "5x114.3",
    offsetMm: 35,
    centerBoreMm: 70.5,
    loadRatingLb: 1500,
    shippingWeightLb: 20,
    style: "Style",
    ...overrides,
  }
}

/** Fake VendorAdapter that parses/normalizes a fixed in-memory row set. */
function makeAdapter(rows: WheelNormalizedRecord[]): VendorAdapter {
  const byPartNumber = new Map(rows.map((r) => [r.partNumber, r]))
  return {
    vendorCode: "test-vendor",
    async fetch() {
      throw new Error("not used in these tests")
    },
    async *parse(): AsyncIterable<ParsedRow> {
      for (const row of rows) {
        yield { partNumber: row.partNumber, raw: { sku: row.partNumber }, warehouseColumns: [] }
      }
    },
    normalize(row: ParsedRow) {
      const found = byPartNumber.get(row.partNumber)
      if (!found) throw new Error(`no fixture row for ${row.partNumber}`)
      return found
    },
    async submitPurchaseOrder(): Promise<never> {
      throw new Error("not used in these tests")
    },
  }
}

/** Stub checker: URLs in `deadUrls` resolve false, everything else true --
 * unless `missing` lists URLs to omit from the returned Map entirely. */
function makeStubChecker(
  deadUrls: Set<string>,
  opts: { missing?: Set<string>; onCheck?: (urls: string[]) => void } = {}
): ImageReachabilityChecker {
  return {
    async check(urls: string[]) {
      opts.onCheck?.(urls)
      const result = new Map<string, boolean>()
      for (const url of urls) {
        if (opts.missing?.has(url)) continue
        result.set(url, !deadUrls.has(url))
      }
      return result
    },
  }
}

function throwingChecker(error: Error): ImageReachabilityChecker {
  return {
    async check() {
      throw error
    },
  }
}

describe("stageFeed (WB-115 Task 3 — image reachability wiring)", () => {
  it("with NO checker passed, behavior is byte-identical to today", async () => {
    const rows = [
      makeNormalized("A"), // valid
      makeNormalized("B", { imageUrl: "" }), // no-image
      makeNormalized("C", { msrpUsd: 0 }), // invalid price
      makeNormalized("D"), // valid
    ]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()

    const result = await stageFeed(adapter, { } as any, service, "run_1", logger)

    expect(result).toEqual({
      rowCount: 4,
      stagedCount: 2,
      skippedNoImageCount: 1,
      skippedInvalidPriceCount: 1,
      skippedImageUnreachableCount: 0,
      imageChecksDistrusted: false,
    })
    expect(service.feedStagingRows.map((r) => r.part_number).sort()).toEqual(["A", "D"])
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("rows with dead URLs are not inserted and are counted", async () => {
    const rows = [makeNormalized("A"), makeNormalized("B"), makeNormalized("C")]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const deadUrl = "https://vendor.example/B.jpg"
    const checker = makeStubChecker(new Set([deadUrl]))
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.9 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    expect(result.stagedCount).toBe(2)
    expect(result.skippedImageUnreachableCount).toBe(1)
    expect(result.imageChecksDistrusted).toBe(false)
    expect(service.feedStagingRows.map((r) => r.part_number).sort()).toEqual(["A", "C"])
    expect(service.stockStagingRows.every((r) => r.part_number !== "B")).toBe(true)
  })

  it("a distrusted run raises rather than silently staging a gutted feed", async () => {
    // 3 rows, all dead, maxDeadRatio 0.4 -> 3/3 = 1.0 > 0.4 -> distrust.
    const rows = [makeNormalized("A"), makeNormalized("B"), makeNormalized("C")]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const allUrls = rows.map((r) => r.imageUrl as string)
    const checker = makeStubChecker(new Set(allUrls))
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    await expect(
      stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)
    ).rejects.toThrow(/circuit breaker tripped/)

    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0]).toMatch(/circuit breaker tripped/)
  })

  it("a DB error from check() propagates rather than being swallowed into mass-dropping", async () => {
    const rows = [makeNormalized("A"), makeNormalized("B")]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const dbError = new Error("connection terminated unexpectedly")
    const checker = throwingChecker(dbError)
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    await expect(
      stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)
    ).rejects.toThrow(dbError)

    // Nothing was inserted -- the error surfaced before any admission
    // decision for this batch, not after silently treating rows as dead.
    expect(service.feedStagingRows).toEqual([])
    // The circuit breaker's own error log must NOT have fired -- this is a
    // different failure mode (checker itself broke) than "too many dead."
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("a URL missing from the returned Map is treated as reachable (fail open)", async () => {
    const rows = [makeNormalized("A"), makeNormalized("B")]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    // Checker reports on nothing -- every URL is "missing" from the Map.
    const checker = makeStubChecker(new Set(), { missing: new Set(rows.map((r) => r.imageUrl as string)) })
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    expect(result.stagedCount).toBe(2)
    expect(result.skippedImageUnreachableCount).toBe(0)
    expect(result.imageChecksDistrusted).toBe(false)
    expect(service.feedStagingRows.map((r) => r.part_number).sort()).toEqual(["A", "B"])
  })

  it("batches the reachability check by unique URL, not once per row", async () => {
    // Two rows sharing the same image URL (e.g. same group, different SKU).
    const sharedUrl = "https://vendor.example/shared.jpg"
    const rows = [
      makeNormalized("A", { imageUrl: sharedUrl }),
      makeNormalized("B", { imageUrl: sharedUrl }),
      makeNormalized("C"),
    ]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const calls: string[][] = []
    const checker = makeStubChecker(new Set(), { onCheck: (urls) => calls.push(urls) })
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    expect(calls).toHaveLength(1)
    expect(calls[0].sort()).toEqual([sharedUrl, "https://vendor.example/C.jpg"].sort())
  })
})
