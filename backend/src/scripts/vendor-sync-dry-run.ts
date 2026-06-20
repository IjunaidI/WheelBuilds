import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from '../modules/vendor-sync'

export default async function vendorSyncDryRun({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const vendorSyncService = container.resolve(VENDOR_SYNC_MODULE)

  const vendorCode = process.argv[process.argv.length - 1]
  if (!vendorCode || vendorCode.endsWith('.ts') || vendorCode.endsWith('.js')) {
    logger.error('Usage: medusa exec ./src/scripts/vendor-sync-dry-run.ts <vendor-code>')
    logger.error('Example: medusa exec ./src/scripts/vendor-sync-dry-run.ts wheelpros-wheels')
    return
  }

  logger.info(`[dry-run] Starting vendor sync for: ${vendorCode}`)
  const startTime = Date.now()

  // Run the full pipeline in dry-run mode
  const { runId } = await (vendorSyncService as any).run(vendorCode, {
    dryRun: true,
    allowSample: true,
    container,
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Fetch the completed run row for the summary
  const [run] = await (vendorSyncService as any).listVendorFeedRuns(
    { id: runId },
    { take: 1 }
  )

  // Print summary
  logger.info('')
  logger.info('Vendor Sync Dry Run Summary')
  logger.info('===========================')
  logger.info(`Vendor:              ${vendorCode}`)
  logger.info(`Run ID:              ${runId}`)
  logger.info(`Status:              ${run.status}`)
  if (run.error_message) {
    logger.info(`Error message:       ${run.error_message}`)
  }
  logger.info(`Rows parsed:         ${run.row_count}`)
  logger.info(`Skipped (no image):  ${run.skipped_no_image_count}`)
  logger.info(`New:                 ${run.new_count}`)
  logger.info(`Changed:             ${run.changed_count}`)
  logger.info(`Discontinued:        ${run.discontinued_count}`)
  logger.info(`Duration:            ${elapsed}s`)
  logger.info('===========================')
}
