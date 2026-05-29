import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'
import { computeContentHash } from '../utils/hash'

const BATCH_SIZE = 500

interface StageResult {
  rowCount: number
  stagedCount: number
  skippedNoImageCount: number
}

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/**
 * Stage a vendor feed: parse, normalize, hash, and insert into staging tables.
 * Rows with empty imageUrl are skipped (counted but not inserted).
 */
export async function stageFeed(
  adapter: VendorAdapter,
  descriptor: VendorFeedDescriptor,
  service: any,
  runId: string,
  logger: Logger
): Promise<StageResult> {
  let rowCount = 0
  let stagedCount = 0
  let skippedNoImageCount = 0

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

    // Skip rows with no image URL
    if (!normalized.imageUrl) {
      skippedNoImageCount++
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
    for (const [warehouseCode, qoh] of Object.entries(normalized.stockByWarehouse)) {
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
  })

  logger.info(
    `Staging complete: ${rowCount} rows parsed, ${stagedCount} staged, ${skippedNoImageCount} skipped (no image)`
  )

  return { rowCount, stagedCount, skippedNoImageCount }
}
