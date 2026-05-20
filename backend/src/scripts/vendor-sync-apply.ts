import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"
import { computeDiff } from "../modules/vendor-sync/pipeline/diff"
import { applyChanges } from "../modules/vendor-sync/pipeline/apply"

export default async function vendorSyncApply({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const vendorSyncService = container.resolve(VENDOR_SYNC_MODULE) as any

  const runId = process.argv[process.argv.length - 1]
  if (!runId || runId.endsWith(".ts") || runId.endsWith(".js")) {
    logger.error(
      "Usage: medusa exec ./src/scripts/vendor-sync-apply.ts <run-id>"
    )
    logger.error(
      "The run-id is returned by vendor-sync-dry-run. The run must be in a completed (dry-run) or diffing status."
    )
    return
  }

  // Look up the run row
  const [run] = await vendorSyncService.listVendorFeedRuns(
    { id: runId },
    { take: 1 }
  )
  if (!run) {
    logger.error(`[apply] Run not found: ${runId}`)
    return
  }

  // Only allow re-apply from certain statuses
  const allowedStatuses = ["completed", "diffing", "failed"]
  if (!allowedStatuses.includes(run.status)) {
    logger.error(
      `[apply] Run ${runId} is in status "${run.status}". ` +
        `Expected one of: ${allowedStatuses.join(", ")}`
    )
    return
  }

  const vendorCode = run.vendor_code
  logger.info(`[apply] Starting apply for run ${runId} (vendor: ${vendorCode})`)
  const startTime = Date.now()

  try {
    // Transition to applying
    await vendorSyncService.updateVendorFeedRuns({
      id: runId,
      status: "applying",
    })

    // Re-compute diff against current state
    logger.info(`[apply] Re-computing diff...`)
    const diff = await computeDiff(vendorSyncService, runId, vendorCode)

    logger.info(
      `[apply] Diff: ${diff.newPartNumbers.length} new, ` +
        `${diff.changedPartNumbers.length} changed, ` +
        `${diff.discontinuedPartNumbers.length} discontinued`
    )

    // Apply changes
    const result = await applyChanges(
      container,
      vendorSyncService,
      runId,
      vendorCode,
      diff,
      logger
    )

    // Mark run as completed
    await vendorSyncService.updateVendorFeedRuns({
      id: runId,
      status: "completed",
      finished_at: new Date(),
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    // Print summary
    logger.info("")
    logger.info("Vendor Sync Apply Summary")
    logger.info("=========================")
    logger.info(`Vendor:              ${vendorCode}`)
    logger.info(`Run ID:              ${runId}`)
    logger.info(`Processed:           ${result.processedCount}`)
    logger.info(`Errors:              ${result.errorCount}`)
    logger.info(`Duration:            ${elapsed}s`)
    if (result.errors.length > 0) {
      logger.info("Errors:")
      for (const err of result.errors.slice(0, 20)) {
        logger.info(`  ${err.partNumber}: ${err.error}`)
      }
      if (result.errors.length > 20) {
        logger.info(`  ... and ${result.errors.length - 20} more`)
      }
    }
    logger.info("=========================")
  } catch (err: any) {
    logger.error(`[apply] Run failed: ${err.message}`)
    await vendorSyncService
      .updateVendorFeedRuns({
        id: runId,
        status: "failed",
        error_message: err.message?.slice(0, 2000),
        finished_at: new Date(),
      })
      .catch((updateErr: any) => {
        logger.error(
          `[apply] Failed to update run status: ${updateErr.message}`
        )
      })
  }
}
