import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'
import { computeContentHash } from '../utils/hash'

const BATCH_SIZE = 500

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
 */
export async function stageFeed(
  adapter: VendorAdapter,
  descriptor: VendorFeedDescriptor,
  service: any,
  runId: string,
  logger: Logger,
  maxRows?: number
): Promise<StageResult> {
  let rowCount = 0
  let stagedCount = 0
  let skippedNoImageCount = 0
  let skippedInvalidPriceCount = 0
  // WB-115: reachability checking + the circuit breaker are wired in Task 3.
  // stageSkipReason is still called without an imageReachable argument here,
  // so it never returns "image-unreachable" yet — these stay at their
  // initial values and exist only so StageResult's shape is already correct.
  const skippedImageUnreachableCount = 0
  const imageChecksDistrusted = false
  let truncated = false

  let feedStagingBatch: any[] = []
  let stockStagingBatch: any[] = []

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

    const skip = stageSkipReason(normalized)
    if (skip === "no-image") {
      skippedNoImageCount++
      continue
    }
    if (skip === "invalid-price") {
      skippedInvalidPriceCount++
      continue
    }

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

    // Flush batches when they reach BATCH_SIZE
    if (feedStagingBatch.length >= BATCH_SIZE) {
      await flushFeedBatch()
    }
    if (stockStagingBatch.length >= BATCH_SIZE) {
      await flushStockBatch()
    }
  }

  // Flush remaining
  await flushFeedBatch()
  await flushStockBatch()

  // Update run row with counts
  await service.updateVendorFeedRuns({
    id: runId,
    row_count: rowCount,
    skipped_no_image_count: skippedNoImageCount,
    skipped_invalid_price_count: skippedInvalidPriceCount,
  })

  logger.info(
    `Staging complete: ${rowCount} rows parsed, ${stagedCount} staged, ` +
      `${skippedNoImageCount} skipped (no image), ${skippedInvalidPriceCount} skipped (invalid price)` +
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
