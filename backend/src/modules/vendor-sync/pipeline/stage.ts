import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'
import { computeContentHash } from '../utils/hash'
import { ImageReachabilityChecker } from './image-reachability'

const BATCH_SIZE = 500

// WB-115: default circuit-breaker threshold, applied when a caller passes an
// `imageCheck` block without an explicit `maxDeadRatio` (e.g. module options
// omit it). Mirrors the env default documented in medusa-config.js
// (`VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO`, default 0.40).
const DEFAULT_MAX_DEAD_RATIO = 0.4

interface StageResult {
  rowCount: number
  stagedCount: number
  skippedNoImageCount: number
  skippedInvalidPriceCount: number
  skippedImageUnreachableCount: number
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
 */
export function shouldTrustImageChecks(
  checked: number,
  dead: number,
  maxRatio: number
): boolean {
  if (checked > 0 && dead / checked > maxRatio) return false
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
  let imageChecksDistrusted = false
  let truncated = false

  // WB-115 circuit-breaker accumulators. Counted per ROW (not per unique
  // URL) so the ratio reflects catalog impact — many rows can share one
  // dead vendor thumbnail, and a breaker keyed on unique URLs would
  // massively understate how much of the feed that single dead image
  // actually affects.
  let checkedCount = 0
  let deadCount = 0

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
    }

    for (const { parsedRow, normalized } of pendingBatch) {
      let reachable: boolean | undefined
      if (reachableByUrl) {
        // A URL absent from the returned Map (checker didn't report on it)
        // resolves to `undefined` here, which stageSkipReason treats as
        // reachable -- fail open, never "unreachable by omission."
        reachable = reachableByUrl.get(normalized.imageUrl as string)
        checkedCount++
        if (reachable === false) deadCount++
      }

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
      logger.warn(
        `Skipping row ${parsedRow.partNumber}: normalization failed: ${err.message}`
      )
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
    const maxDeadRatio = imageCheck.maxDeadRatio ?? DEFAULT_MAX_DEAD_RATIO
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
    }
  }

  // WB-115: a single aggregate summary line rather than per-URL logging --
  // Task 2's checker already warns on individual timeout/error probes, so
  // stage.ts must not add a second per-row log source on top of that (a full
  // CDN outage would otherwise emit thousands of lines per run).
  logger.info(
    `Staging complete: ${rowCount} rows parsed, ${stagedCount} staged, ` +
      `${skippedNoImageCount} skipped (no image), ${skippedInvalidPriceCount} skipped (invalid price), ` +
      `${skippedImageUnreachableCount} skipped (image unreachable)` +
      (imageCheck ? ` [image checks: ${checkedCount} checked, ${deadCount} dead]` : '') +
      (truncated ? ` [TRUNCATED to maxRows=${maxRows} — dev mode]` : '')
  )

  return {
    rowCount,
    stagedCount,
    skippedNoImageCount,
    skippedInvalidPriceCount,
    skippedImageUnreachableCount,
    imageChecksDistrusted,
  }
}
