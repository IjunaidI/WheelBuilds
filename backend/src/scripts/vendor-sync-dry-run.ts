import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from '../modules/vendor-sync'
import { resolveAdapter } from '../modules/vendor-sync/adapters/registry'
import { fetchFeed } from '../modules/vendor-sync/pipeline/fetch'
import { stageFeed } from '../modules/vendor-sync/pipeline/stage'

export default async function vendorSyncDryRun({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const vendorSyncService = container.resolve(VENDOR_SYNC_MODULE)

  const vendorCode = process.argv[process.argv.length - 1]
  if (!vendorCode || vendorCode.endsWith('.ts') || vendorCode.endsWith('.js')) {
    logger.error('Usage: medusa exec ./src/scripts/vendor-sync-dry-run.ts <vendor-code>')
    logger.error('Example: medusa exec ./src/scripts/vendor-sync-dry-run.ts teraflex-wheels')
    return
  }

  logger.info(`[dry-run] Starting vendor sync for: ${vendorCode}`)

  // Resolve adapter
  const adapter = resolveAdapter(vendorCode)

  // Fetch feed
  logger.info('[dry-run] Fetching feed...')
  const descriptor = await fetchFeed(adapter)
  logger.info(
    `[dry-run] Feed fetched: ${descriptor.sourceFilename} (${descriptor.byteLength} bytes)`
  )

  // Create run row
  const [run] = await (vendorSyncService as any).createVendorFeedRuns({
    vendor_code: vendorCode,
    source_filename: descriptor.sourceFilename,
    source_archive_key: descriptor.archiveKey,
    status: 'dry-run',
    started_at: new Date(),
    row_count: 0,
    skipped_no_image_count: 0,
    hash_match_count: 0,
    new_count: 0,
    changed_count: 0,
    discontinued_count: 0,
  })

  logger.info(`[dry-run] Created run: ${run.id}`)

  // Stage feed (populates staging tables only, no Medusa product changes)
  const result = await stageFeed(adapter, descriptor, vendorSyncService, run.id, logger)

  // Update run status
  await (vendorSyncService as any).updateVendorFeedRuns({
    id: run.id,
    status: 'dry-run-complete',
    finished_at: new Date(),
  })

  // Print summary
  logger.info('--- Dry Run Summary ---')
  logger.info(`Vendor:              ${vendorCode}`)
  logger.info(`Run ID:              ${run.id}`)
  logger.info(`Source file:         ${descriptor.sourceFilename}`)
  logger.info(`File size:           ${descriptor.byteLength} bytes`)
  logger.info(`Total rows parsed:   ${result.rowCount}`)
  logger.info(`Rows staged:         ${result.stagedCount}`)
  logger.info(`Skipped (no image):  ${result.skippedNoImageCount}`)
  logger.info('-----------------------')
}
