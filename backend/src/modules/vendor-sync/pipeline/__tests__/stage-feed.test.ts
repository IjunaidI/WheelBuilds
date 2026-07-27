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
      skippedNormalizationCount: 0,
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
    // 60 rows (each a distinct URL), all dead, maxDeadRatio 0.4 -> 60/60 =
    // 1.0 > 0.4 -> distrust. Must clear the WB-115 premerge Change 2
    // minimum-sample floor (50) or the breaker can never trip regardless of
    // ratio -- see the dedicated below-the-floor test for that behavior.
    const rows = Array.from({ length: 60 }, (_, i) => makeNormalized(`R${i}`))
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

  // Finding 1 (review): the circuit-breaker denominator must be unique
  // URLs, not rows -- a probe is per-URL, and counting one checker verdict
  // once per SKU that shares a thumbnail massively overstates how much of
  // the feed a single dead image actually implicates.
  it("dedupes the circuit-breaker denominator by unique URL, not per row", async () => {
    const deadUrl = "https://vendor.example/shared-dead.jpg"
    // 10 rows share ONE dead URL; 5 rows each have their own distinct
    // healthy URL. Per-row counting: 10 dead / 15 checked = 0.667 > 0.4 ->
    // would (wrongly) trip. Per-URL counting: 1 dead / 6 checked (1 dead
    // url + 5 healthy urls) = 0.167 -> trusts, no trip.
    const deadRows = Array.from({ length: 10 }, (_, i) =>
      makeNormalized(`D${i}`, { imageUrl: deadUrl })
    )
    const healthyRows = Array.from({ length: 5 }, (_, i) => makeNormalized(`H${i}`))
    const rows = [...deadRows, ...healthyRows]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const checker = makeStubChecker(new Set([deadUrl]))
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    expect(result.imageChecksDistrusted).toBe(false)
    expect(logger.error).not.toHaveBeenCalled()
    // Every SKU sharing the dead thumbnail is still individually dropped --
    // dedup only affects the breaker's own denominator, not admission.
    expect(result.skippedImageUnreachableCount).toBe(10)
    expect(result.stagedCount).toBe(5)

    const summary = logger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((msg: string) => /image checks:/.test(msg))
    expect(summary).toMatch(/\[image checks: 6 checked, 1 dead\]/)
  })

  // Finding 1 (review): a URL absent from the returned Map must not be
  // counted as "checked" -- it dilutes the ratio toward false trust
  // otherwise, since the checker never actually resolved it.
  it("does not count a URL missing from the returned Map toward checkedCount", async () => {
    const missingUrl = "https://vendor.example/missing.jpg"
    const healthyUrl = "https://vendor.example/healthy.jpg"
    const rows = [
      makeNormalized("A", { imageUrl: missingUrl }),
      makeNormalized("B", { imageUrl: healthyUrl }),
    ]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    // Checker resolves the healthy URL but reports nothing on the missing
    // one -- if a missing entry were (wrongly) counted as checked, the
    // summary would read "2 checked, 0 dead" instead of "1 checked, 0 dead".
    const checker = makeStubChecker(new Set(), { missing: new Set([missingUrl]) })
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    expect(result.imageChecksDistrusted).toBe(false)
    const summary = logger.info.mock.calls
      .map((call: any[]) => call[0])
      .find((msg: string) => /image checks:/.test(msg))
    expect(summary).toMatch(/\[image checks: 1 checked, 0 dead\]/)
  })

  // Finding 2 (review): BATCH_SIZE is 500 and every prior test used <=4
  // rows, so nothing exercised batch 2..N -- exactly the code this task
  // restructured.
  it("processes multiple batches when the feed exceeds BATCH_SIZE (501 rows -> 2 checker calls)", async () => {
    const rows: WheelNormalizedRecord[] = []
    for (let i = 0; i < 500; i++) {
      rows.push(makeNormalized(`R${i}`))
    }
    // The 501st row lands in the second batch and has a dead image.
    const deadUrl = "https://vendor.example/R500-dead.jpg"
    rows.push(makeNormalized("R500", { imageUrl: deadUrl }))

    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const calls: string[][] = []
    const checker = makeStubChecker(new Set([deadUrl]), { onCheck: (urls) => calls.push(urls) })
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    // Two batches -> two checker.check() calls; pendingBatch reset cleanly
    // between them (first call sees exactly the first 500 unique URLs,
    // second call sees exactly the 501st).
    expect(calls).toHaveLength(2)
    expect(calls[0]).toHaveLength(500)
    expect(calls[1]).toEqual([deadUrl])

    // No rows lost or double-counted across the batch boundary.
    expect(result.rowCount).toBe(501)
    expect(result.stagedCount).toBe(500)
    expect(result.skippedImageUnreachableCount).toBe(1)
    expect(service.feedStagingRows).toHaveLength(500)
    expect(new Set(service.feedStagingRows.map((r) => r.part_number)).size).toBe(500)

    // The dead row located in the SECOND batch is actually dropped.
    expect(service.feedStagingRows.some((r) => r.part_number === "R500")).toBe(false)
  })

  // Finding 3 (review): a malformed VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO env var
  // parses (via parseFloat upstream in medusa-config.js) to NaN, and
  // `dead/checked > NaN` is always false -- silently disabling the breaker.
  it("falls back to the default max-dead-ratio and warns when maxDeadRatio is not finite", async () => {
    // 60 rows to clear the WB-115 premerge Change 2 minimum-sample floor
    // (50) -- see the note on the previous test.
    const rows = Array.from({ length: 60 }, (_, i) => makeNormalized(`R${i}`))
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const allUrls = rows.map((r) => r.imageUrl as string)
    const checker = makeStubChecker(new Set(allUrls))
    // Simulates parseFloat("garbage") from a malformed env var.
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: NaN }

    await expect(
      stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)
    ).rejects.toThrow(/circuit breaker tripped/)

    // Trips at the fallback default (0.4), proving NaN did NOT silently
    // disable the breaker (60/60 dead = 1.0 > 0.4).
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/invalid maxDeadRatio/i))
  })

  // WB-115 premerge Change 2: minimum-sample floor. A run this small (2
  // unique URLs) must not abort even at a 100% dead ratio -- but it must not
  // fail SILENTLY either, since a ratio this bad is still a real (if
  // statistically unproven) signal worth a loud warning.
  it("a tiny sample (below the 50-URL floor) with a terrible ratio does not trip the breaker, but warns explicitly", async () => {
    const rows = [makeNormalized("A"), makeNormalized("B")]
    const adapter = makeAdapter(rows)
    const service = makeFakeService()
    const logger = makeLogger()
    const allUrls = rows.map((r) => r.imageUrl as string)
    // Both of the 2 checked URLs are dead -- 100% ratio, which would trip
    // any sane maxDeadRatio -- but only 2 URLs were checked, well below the
    // 50-URL floor.
    const checker = makeStubChecker(new Set(allUrls))
    const imageCheck: StageImageCheckOptions = { checker, maxDeadRatio: 0.4 }

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger, undefined, imageCheck)

    // The run must NOT abort: both rows are dropped individually (fail-open
    // stays row-scoped), but the run completes rather than throwing.
    expect(result.imageChecksDistrusted).toBe(false)
    expect(result.skippedImageUnreachableCount).toBe(2)
    expect(logger.error).not.toHaveBeenCalled()

    // But the small-sample suppression must be logged loudly, not silently.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/too small to trust/i)
    )
    const warnMsg = logger.warn.mock.calls
      .map((call: any[]) => call[0])
      .find((msg: string) => /too small to trust/i.test(msg))
    expect(warnMsg).toMatch(/2\/2/)
  })
})

describe("stageFeed normalization-failure accounting", () => {
  /** Adapter that yields `total` rows, of which the ones whose part number is
   *  in `failing` throw the supplied error out of normalize(). */
  function makeFailingAdapter(
    rows: WheelNormalizedRecord[],
    failing: Map<string, Error>
  ): VendorAdapter {
    const byPartNumber = new Map(rows.map((r) => [r.partNumber, r]))
    return {
      vendorCode: "test-vendor",
      async fetch() {
        throw new Error("not used")
      },
      async *parse(): AsyncIterable<ParsedRow> {
        for (const row of rows) {
          yield { partNumber: row.partNumber, raw: {}, warehouseColumns: [] }
        }
      },
      normalize(row: ParsedRow) {
        const failure = failing.get(row.partNumber)
        if (failure) throw failure
        return byPartNumber.get(row.partNumber)!
      },
      async submitPurchaseOrder(): Promise<never> {
        throw new Error("not used")
      },
    }
  }

  function boltPatternZodError(): Error {
    const err: any = new Error("[\n  {\n    \"code\": \"too_small\"\n  }\n]")
    err.issues = [
      { code: "too_small", message: "BoltPattern is required", path: ["BoltPattern"] },
    ]
    return err
  }

  it("counts skipped rows so the summary line balances", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeNormalized(`P${i}`))
    const failing = new Map<string, Error>([
      ["P1", boltPatternZodError()],
      ["P2", boltPatternZodError()],
      ["P3", new Error('Invalid size format: "18"')],
    ])
    const adapter = makeFailingAdapter(rows, failing)
    const service = makeFakeService()
    const logger = makeLogger()

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger)

    expect(result.rowCount).toBe(10)
    expect(result.stagedCount).toBe(7)
    expect(result.skippedNormalizationCount).toBe(3)

    // The whole point: parsed must equal staged + every skip bucket.
    expect(
      result.stagedCount +
        result.skippedNoImageCount +
        result.skippedInvalidPriceCount +
        result.skippedImageUnreachableCount +
        result.skippedNormalizationCount
    ).toBe(result.rowCount)

    const summary = logger.info.mock.calls
      .map((c: any[]) => c[0])
      .find((m: string) => /Staging complete/.test(m))
    expect(summary).toMatch(/3 skipped \(normalization\)/)
  })

  it("caps per-row warnings and aggregates the rest by reason", async () => {
    // 30 rows failing the SAME way -- the production shape (56x
    // "BoltPattern is required" in one run).
    const rows = Array.from({ length: 40 }, (_, i) => makeNormalized(`P${i}`))
    const failing = new Map<string, Error>()
    for (let i = 0; i < 30; i++) failing.set(`P${i}`, boltPatternZodError())
    const adapter = makeFailingAdapter(rows, failing)
    const service = makeFakeService()
    const logger = makeLogger()

    const result = await stageFeed(adapter, {} as any, service, "run_1", logger)
    expect(result.skippedNormalizationCount).toBe(30)

    const perRow = logger.warn.mock.calls
      .map((c: any[]) => c[0])
      .filter((m: string) => /^Skipping row /.test(m))
    expect(perRow).toHaveLength(5)
    // The raw ZodError JSON must never reach the log again.
    for (const msg of perRow) {
      expect(msg).not.toContain("\n")
      expect(msg).toContain("BoltPattern: BoltPattern is required")
    }

    const aggregate = logger.warn.mock.calls
      .map((c: any[]) => c[0])
      .find((m: string) => /^Normalization skipped/.test(m))
    expect(aggregate).toContain("30 of 40 rows")
    expect(aggregate).toContain("1 distinct reason(s)")
    expect(aggregate).toContain("25 per-row warning(s) suppressed")
    expect(aggregate).toContain("30x BoltPattern: BoltPattern is required")
  })

  it("orders distinct reasons by frequency", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeNormalized(`P${i}`))
    const failing = new Map<string, Error>()
    for (let i = 0; i < 3; i++) failing.set(`P${i}`, new Error('Invalid size format: "18"'))
    for (let i = 3; i < 12; i++) failing.set(`P${i}`, boltPatternZodError())
    const adapter = makeFailingAdapter(rows, failing)
    const logger = makeLogger()

    await stageFeed(adapter, {} as any, makeFakeService(), "run_1", logger)

    const aggregate = logger.warn.mock.calls
      .map((c: any[]) => c[0])
      .find((m: string) => /^Normalization skipped/.test(m))
    expect(aggregate).toContain("2 distinct reason(s)")
    // 9x BoltPattern must precede 3x Invalid size format.
    expect(aggregate.indexOf("9x BoltPattern")).toBeLessThan(
      aggregate.indexOf('3x Invalid size format')
    )
  })

  it("logs no aggregate line at all when every row normalizes", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeNormalized(`P${i}`))
    const adapter = makeFailingAdapter(rows, new Map())
    const logger = makeLogger()

    const result = await stageFeed(adapter, {} as any, makeFakeService(), "run_1", logger)

    expect(result.skippedNormalizationCount).toBe(0)
    expect(
      logger.warn.mock.calls
        .map((c: any[]) => c[0])
        .filter((m: string) => /^Normalization skipped/.test(m))
    ).toHaveLength(0)
  })
})
