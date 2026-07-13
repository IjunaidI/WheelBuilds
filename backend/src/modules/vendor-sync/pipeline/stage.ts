import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'
import { computeContentHash } from '../utils/hash'

const BATCH_SIZE = 500

interface StageResult {
  rowCount: number
  stagedCount: number
  skippedNoImageCount: number
  skippedInvalidPriceCount: number
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
 */
export function stageSkipReason(
  normalized: { imageUrl?: string | null; msrpUsd: number }
): "no-image" | "invalid-price" | null {
  if (!normalized.imageUrl) return "no-image"
  if (!(normalized.msrpUsd > 0)) return "invalid-price"
  return null
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

  return { rowCount, stagedCount, skippedNoImageCount, skippedInvalidPriceCount }
}
