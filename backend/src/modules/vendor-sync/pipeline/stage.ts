import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'
import { computeContentHash } from '../utils/hash'
import { ImageReachabilityChecker } from './image-reachability'
import { summarizeNormalizationError } from './normalization-error'

const BATCH_SIZE = 500

// Per-row normalization warnings emitted before falling back to the
// end-of-run aggregate. A production wheels run rejects ~65 rows out of
// ~40k, every run, for the same handful of reasons (empty BoltPattern on
// display units and accessories, unparseable Size). Printing each one --
// previously as the raw ZodError, i.e. ~13 lines of JSON apiece -- buried
// the summary line under hundreds of lines of noise without telling an
// operator anything the aggregate doesn't. A few concrete examples are
// still worth having for debugging, hence a cap rather than silence.
const MAX_NORMALIZATION_WARNINGS = 5

// WB-115: default circuit-breaker threshold, applied when a caller passes an
// `imageCheck` block without an explicit `maxDeadRatio` (e.g. module options
// omit it). Mirrors the env default documented in medusa-config.js
// (`VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO`, default 0.40).
const DEFAULT_MAX_DEAD_RATIO = 0.4

// WB-115 premerge Change 2: minimum-sample floor for the circuit breaker.
// An earlier tires run checked only 2 unique URLs, found 1 dead, and its
// summary line read "50% dead" -- a number that looks like a catalog-wide
// image crisis but was really just proof the feed had 11 rows in it. A tiny
// sample makes the ratio statistically meaningless in either direction, so
// the breaker must never trip below this floor no matter how bad the ratio
// looks.
const DEFAULT_MIN_SAMPLE = 50

interface StageResult {
  rowCount: number
  stagedCount: number
  skippedNoImageCount: number
  skippedInvalidPriceCount: number
  skippedImageUnreachableCount: number
  // Rows the adapter refused to normalize. Previously counted nowhere at all,
  // which left the "Staging complete" line failing to balance: a real run read
  // 40,475 parsed / 31,432 staged / 6,705 no-image / 0 price / 2,273
  // unreachable, and the missing 65 rows were invisible unless you did the
  // subtraction by hand.
  skippedNormalizationCount: number
  imageChecksDistrusted: boolean
}

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/**
 * WB-115 Task 3 wiring. `checker` is the already-constructed
 * ImageReachabilityChecker (Task 2); `stageFeed` never builds one itself, so
 * a caller with `imageCheck.enabled === false` simply omits this argument
 * entirely and staging behaves exactly as it did before this feature existed
 * (the production kill switch). `maxDeadRatio` defaults to
 * DEFAULT_MAX_DEAD_RATIO when omitted.
 */
export interface StageImageCheckOptions {
  checker: ImageReachabilityChecker
  maxDeadRatio?: number
}

/**
 * Why a normalized row is dropped at staging, or null if it should be staged.
 * Image gate is WB-084; the non-positive/missing MSRP gate is WB-089 L3 (a $0
 * price becomes a $0 Medusa price + a "From $0.00" card addable at $0).
 *
 * WB-115 extends the image gate from "is there a URL" to "does the URL still
 * resolve" — 664/2,852 indexed products (23%) pointed at a vendor thumbnail
 * that 404s, and an empty-string check never catches that. `imageReachable`
 * is optional and MUST fail open: `undefined` means "not checked" (Task 2's
 * checker didn't run, timed out, or the circuit breaker distrusted its own
 * results) and is treated as reachable so an unknown image never hides a
 * product. Only an explicit `false` — set solely on a definitive 404/410 by
 * Task 2 — removes a row. Order: an empty/missing URL is still "no-image"
 * even if `imageReachable` is (nonsensically) `false`; only once a URL is
 * present does the reachability check apply, ahead of the price check.
 */
export function stageSkipReason(
  normalized: { imageUrl?: string | null; msrpUsd: number },
  imageReachable?: boolean
): "no-image" | "image-unreachable" | "invalid-price" | null {
  if (!normalized.imageUrl) return "no-image"
  if (imageReachable === false) return "image-unreachable"
  if (!(normalized.msrpUsd > 0)) return "invalid-price"
  return null
}

/**
 * WB-115 circuit breaker for the image reachability gate. If the checker
 * itself is unreliable — a vendor CDN blip, a network outage on our end —
 * a huge fraction of "dead" results would be false positives, and trusting
 * them could delist the entire catalog. `false` means "distrust the checked
 * results this run"; the caller (Task 3) must FAIL THE RUN rather than
 * stage everything as reachable, because rows are filtered during a
 * streaming pass and can't be retroactively un-filtered once skipped.
 * `checked === 0` always returns true (nothing to distrust, and it avoids
 * dividing by zero).
 *
 * WB-115 premerge Change 2: `minSample` (default `DEFAULT_MIN_SAMPLE` = 50)
 * is a floor below which the breaker may NEVER trip, regardless of ratio —
 * `checked < minSample` short-circuits to `true` before the ratio is even
 * computed. A tiny `checked` count makes dead/checked statistically
 * meaningless (2 checked, 1 dead reads as a "50% crisis" that's really just
 * a symptom of an 11-row truncated feed). This function stays pure and
 * synchronous — it only decides trust, it never logs. The caller
 * (`stageFeed`) is responsible for warning when the floor suppresses a trip
 * the ratio alone would have triggered; silence there would hide a real
 * signal.
 */
export function shouldTrustImageChecks(
  checked: number,
  dead: number,
  maxRatio: number,
  minSample: number = DEFAULT_MIN_SAMPLE
): boolean {
  if (checked < minSample) return true
  if (dead / checked > maxRatio) return false
  return true
}

/**
 * Stage a vendor feed: parse, normalize, hash, and insert into staging tables.
 * Rows with empty imageUrl are skipped (counted but not inserted).
 *
 * When `maxRows` is a positive number, only the first `maxRows` CSV rows are
 * consumed before staging stops. This is the dev/test truncation knob (wired
 * from medusa-config's `devMaxRows`) so local runs finish fast instead of
 * staging + diffing + applying the entire vendor feed.
 *
 * `imageCheck` (WB-115 Task 3) is optional. When omitted, staging is
 * byte-identical to before this feature existed: `stageSkipReason` is called
 * with no second argument, so it can never return "image-unreachable". When
 * provided, rows are gated in BATCH_SIZE-sized groups: each group's unique
 * non-empty image URLs are checked together (one `checker.check()` call),
 * then each row's individual verdict is looked up back out of the returned
 * Map before `stageSkipReason` decides admission. This preserves the
 * existing streaming/bounded-memory shape — at most BATCH_SIZE rows are ever
 * buffered awaiting a verdict.
 *
 * `checker.check()` errors (e.g. a real DB failure inside the checker's
 * cache lookup/persist calls) are NOT caught here — they propagate and
 * reject this function's promise, which the caller (service.ts) already
 * treats as a run failure. This is deliberate: a missing/absent entry in
 * `check()`'s returned Map is fail-open ("reachable"), but a thrown error is
 * a different signal entirely (something is broken, not "this URL is
 * fine") and must not be silently reinterpreted as "every pending row is
 * unreachable" — that would drop rows at scale exactly like the bug this
 * feature exists to prevent. See `shouldTrustImageChecks` above for the
 * complementary guard against a checker that returns *successfully* but
 * with implausibly many dead results.
 */
export async function stageFeed(
  adapter: VendorAdapter,
  descriptor: VendorFeedDescriptor,
  service: any,
  runId: string,
  logger: Logger,
  maxRows?: number,
  imageCheck?: StageImageCheckOptions
): Promise<StageResult> {
  let rowCount = 0
  let stagedCount = 0
  let skippedNoImageCount = 0
  let skippedInvalidPriceCount = 0
  let skippedImageUnreachableCount = 0
  let skippedNormalizationCount = 0
  let imageChecksDistrusted = false
  let truncated = false

  // reason -> { count, firstPartNumber }. Keyed by the SUMMARIZED reason
  // (see normalization-error.ts) precisely because that string is stable
  // across rows failing the same way, which is what makes the aggregate
  // meaningful.
  const normalizationFailures = new Map<
    string,
    { count: number; firstPartNumber: string }
  >()

  // WB-115 circuit-breaker accumulators. The breaker is a self-distrust
  // guard on the CHECKER, not a catalog-impact guard (that job belongs to
  // service.ts's discontinuedCount/currentCount > 0.05 park-for-approval
  // check). Its evidence unit is a probe, and a probe is per unique URL --
  // counting the same checker verdict once per SKU that happens to share a
  // thumbnail (wheels average ~17 variant rows per product) would let one
  // dead placeholder swing the ratio by dozens of "rows" from a single
  // result, which is noise, not evidence the checker is unreliable.
  // `checkedUrls` dedupes across the ENTIRE run (not just within one
  // BATCH_SIZE batch) since two products far apart in the feed can still
  // share a CDN thumbnail.
  let checkedCount = 0
  let deadCount = 0
  const checkedUrls = new Set<string>()

  let feedStagingBatch: any[] = []
  let stockStagingBatch: any[] = []
  // Rows that passed the no-image gate and are awaiting an image-reachability
  // verdict before final admission. Bounded at BATCH_SIZE, mirroring the
  // insertion batches below, so memory stays bounded regardless of feed size.
  let pendingBatch: Array<{ parsedRow: any; normalized: any }> = []

  async function flushFeedBatch() {
    if (feedStagingBatch.length > 0) {
      await service.createVendorFeedStagings(feedStagingBatch)
      feedStagingBatch = []
    }
  }

  async function flushStockBatch() {
    if (stockStagingBatch.length > 0) {
      await service.createVendorStockStagings(stockStagingBatch)
      stockStagingBatch = []
    }
  }

  function admitRow(parsedRow: any, normalized: any) {
    const contentHash = computeContentHash(normalized)

    feedStagingBatch.push({
      run_id: runId,
      vendor_code: adapter.vendorCode,
      part_number: normalized.partNumber,
      group_key: normalized.groupKey,
      row_json: parsedRow.raw,
      normalized,
      content_hash: contentHash,
    })

    // Insert stock rows for each warehouse with qoh > 0
    const stockEntries = Object.entries(normalized.stockByWarehouse) as [string, number][]
    for (const [warehouseCode, qoh] of stockEntries) {
      if (qoh > 0) {
        stockStagingBatch.push({
          run_id: runId,
          vendor_code: adapter.vendorCode,
          part_number: normalized.partNumber,
          warehouse_code: warehouseCode,
          qoh,
        })
      }
    }

    stagedCount++
  }

  // Resolve the pending batch's admission: check reachability once for the
  // batch's unique URLs (if a checker is configured), then decide each row
  // individually. `reachableByUrl` stays undefined when no checker was
  // passed, so every lookup below is undefined -> stageSkipReason's fail-open
  // path -> identical to calling stageSkipReason(normalized) with one arg.
  async function processPendingBatch() {
    if (pendingBatch.length === 0) return

    let reachableByUrl: Map<string, boolean> | undefined
    if (imageCheck) {
      const urls = Array.from(
        new Set(
          pendingBatch
            .map((item) => item.normalized.imageUrl as string | null)
            .filter((url): url is string => !!url)
        )
      )
      // Deliberately unguarded -- see the stageFeed docstring. A DB error
      // thrown here must propagate and fail the run, not be swallowed into
      // "treat everything as unreachable."
      reachableByUrl = await imageCheck.checker.check(urls)

      // WB-115 circuit-breaker accounting -- one probe per unique URL,
      // deduped across the whole run via `checkedUrls` (see its
      // declaration above for why). A URL absent from the returned Map
      // was never actually resolved by the checker, so it must not count
      // as checked (and certainly not as dead) -- only URLs the checker
      // actually reported on move the ratio.
      for (const url of urls) {
        if (checkedUrls.has(url) || !reachableByUrl.has(url)) continue
        checkedUrls.add(url)
        checkedCount++
        if (reachableByUrl.get(url) === false) deadCount++
      }
    }

    for (const { parsedRow, normalized } of pendingBatch) {
      // A URL absent from `reachableByUrl` (checker didn't report on it)
      // resolves to `undefined` here, which stageSkipReason treats as
      // reachable -- fail open, never "unreachable by omission." Admission
      // stays per-ROW even though the breaker's counters above are
      // deduped by URL: every SKU sharing a dead thumbnail must still be
      // individually dropped from the catalog.
      const reachable = reachableByUrl?.get(normalized.imageUrl as string)

      const skip = stageSkipReason(normalized, reachable)
      if (skip === "image-unreachable") {
        skippedImageUnreachableCount++
        continue
      }
      if (skip === "invalid-price") {
        skippedInvalidPriceCount++
        continue
      }

      admitRow(parsedRow, normalized)

      // Flush batches when they reach BATCH_SIZE
      if (feedStagingBatch.length >= BATCH_SIZE) {
        await flushFeedBatch()
      }
      if (stockStagingBatch.length >= BATCH_SIZE) {
        await flushStockBatch()
      }
    }

    pendingBatch = []
  }

  for await (const parsedRow of adapter.parse(descriptor)) {
    if (maxRows != null && maxRows > 0 && rowCount >= maxRows) {
      truncated = true
      break
    }
    rowCount++

    let normalized
    try {
      normalized = adapter.normalize(parsedRow)
    } catch (err: any) {
      skippedNormalizationCount++
      const reason = summarizeNormalizationError(err)
      const seen = normalizationFailures.get(reason)
      if (seen) {
        seen.count++
      } else {
        normalizationFailures.set(reason, {
          count: 1,
          firstPartNumber: parsedRow.partNumber,
        })
      }
      if (skippedNormalizationCount <= MAX_NORMALIZATION_WARNINGS) {
        logger.warn(
          `Skipping row ${parsedRow.partNumber}: normalization failed: ${reason}`
        )
      }
      continue
    }

    // The no-image gate never depends on reachability, so it's applied here
    // immediately rather than deferred into the pending/reachability batch.
    if (!normalized.imageUrl) {
      skippedNoImageCount++
      continue
    }

    pendingBatch.push({ parsedRow, normalized })
    if (pendingBatch.length >= BATCH_SIZE) {
      await processPendingBatch()
    }
  }

  // Flush remaining
  await processPendingBatch()
  await flushFeedBatch()
  await flushStockBatch()

  // Update run row with counts
  await service.updateVendorFeedRuns({
    id: runId,
    row_count: rowCount,
    skipped_no_image_count: skippedNoImageCount,
    skipped_invalid_price_count: skippedInvalidPriceCount,
  })

  // WB-115 circuit breaker. Rows were already filtered during the streaming
  // pass above and cannot be retroactively un-filtered, so the only way to
  // guarantee no partial delisting reaches the catalog is to abort the run
  // before diff/apply ever runs -- a failed run leaves the previous
  // (already-applied) catalog state fully intact. Both service.ts call
  // sites already wrap their stageFeed call in a try/catch that marks the
  // run "failed" and returns without proceeding to diff/apply, so throwing
  // here is sufficient; no separate caller-side check is required.
  if (imageCheck) {
    let maxDeadRatio = imageCheck.maxDeadRatio ?? DEFAULT_MAX_DEAD_RATIO
    // WB-115: `imageCheck.maxDeadRatio` is normally `parseFloat(env var)`
    // upstream (medusa-config.js). A malformed env value parses to NaN,
    // which is neither null nor undefined -- `??` above would NOT catch it
    // -- and `dead/checked > NaN` is always false, so an unguarded NaN
    // would silently disable the breaker entirely rather than falling back
    // to the documented default. Guard explicitly and warn so a typo is
    // visible in logs instead of a quietly-neutered safety check.
    if (!Number.isFinite(maxDeadRatio)) {
      logger.warn(
        `[vendor-sync] [${runId}] invalid maxDeadRatio (${imageCheck.maxDeadRatio}) ` +
          `for vendor=${adapter.vendorCode} -- falling back to default ${DEFAULT_MAX_DEAD_RATIO}`
      )
      maxDeadRatio = DEFAULT_MAX_DEAD_RATIO
    }
    if (!shouldTrustImageChecks(checkedCount, deadCount, maxDeadRatio)) {
      imageChecksDistrusted = true
      const ratio = checkedCount > 0 ? deadCount / checkedCount : 0
      const message =
        `[vendor-sync] [${runId}] image reachability circuit breaker tripped ` +
        `for vendor=${adapter.vendorCode}: ${deadCount}/${checkedCount} checked ` +
        `images were dead (ratio=${ratio.toFixed(3)}, max=${maxDeadRatio}). ` +
        `Aborting run before diff/apply -- catalog left unchanged.`
      logger.error(message)
      throw new Error(message)
    } else if (
      checkedCount < DEFAULT_MIN_SAMPLE &&
      checkedCount > 0 &&
      deadCount / checkedCount > maxDeadRatio
    ) {
      // WB-115 premerge Change 2: the min-sample floor inside
      // shouldTrustImageChecks just silently kept trusting this run -- but
      // silence is exactly the failure mode this feature exists to prevent.
      // The ratio alone WOULD have tripped the breaker; it's only the small
      // sample that's holding it back, so say so explicitly rather than
      // letting a real (if statistically unproven) signal disappear into an
      // ordinary info-level summary line.
      const ratio = deadCount / checkedCount
      logger.warn(
        `[vendor-sync] [${runId}] image reachability ratio ${deadCount}/${checkedCount} ` +
          `(ratio=${ratio.toFixed(3)}) exceeds max=${maxDeadRatio} for vendor=${adapter.vendorCode}, ` +
          `but the sample is too small to trust (checked=${checkedCount} < minSample=${DEFAULT_MIN_SAMPLE}) ` +
          `-- NOT tripping the breaker.`
      )
    }
  }

  // WB-115: a single aggregate summary line rather than per-URL logging --
  // Task 2's checker already warns on individual timeout/error probes, so
  // stage.ts must not add a second per-row log source on top of that (a full
  // CDN outage would otherwise emit thousands of lines per run).
  // One aggregated line per distinct failure reason, replacing the former
  // one-warning-per-row firehose. Sorted by count so the dominant reason is
  // first, with a sample part number to make any single case reproducible.
  if (normalizationFailures.size > 0) {
    const byFrequency = [...normalizationFailures.entries()].sort(
      (a, b) => b[1].count - a[1].count
    )
    const suppressed = Math.max(
      0,
      skippedNormalizationCount - MAX_NORMALIZATION_WARNINGS
    )
    logger.warn(
      `Normalization skipped ${skippedNormalizationCount} of ${rowCount} rows ` +
        `across ${normalizationFailures.size} distinct reason(s)` +
        (suppressed > 0
          ? ` (${suppressed} per-row warning(s) suppressed after the first ${MAX_NORMALIZATION_WARNINGS})`
          : '') +
        `: ` +
        byFrequency
          .map(([reason, { count, firstPartNumber }]) => `${count}x ${reason} (e.g. ${firstPartNumber})`)
          .join(' | ')
    )
  }

  logger.info(
    `Staging complete: ${rowCount} rows parsed, ${stagedCount} staged, ` +
      `${skippedNoImageCount} skipped (no image), ${skippedInvalidPriceCount} skipped (invalid price), ` +
      `${skippedImageUnreachableCount} skipped (image unreachable), ` +
      `${skippedNormalizationCount} skipped (normalization)` +
      (imageCheck ? ` [image checks: ${checkedCount} checked, ${deadCount} dead]` : '') +
      (truncated ? ` [TRUNCATED to maxRows=${maxRows} — dev mode]` : '')
  )

  return {
    rowCount,
    stagedCount,
    skippedNoImageCount,
    skippedInvalidPriceCount,
    skippedImageUnreachableCount,
    skippedNormalizationCount,
    imageChecksDistrusted,
  }
}
