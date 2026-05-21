import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

/**
 * Cleanup stale vendor-sync runs stuck in progress.
 * Usage: medusa exec ./src/scripts/vendor-sync-cleanup.ts
 */
export default async function vendorSyncCleanup({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any

  const staleStatuses = ["fetching", "staging", "diffing", "applying"]
  const staleRuns = await service.listVendorFeedRuns({
    status: staleStatuses,
  })

  if (staleRuns.length === 0) {
    logger.info("No stale runs found.")
    return
  }

  for (const run of staleRuns) {
    await service.updateVendorFeedRuns({
      id: run.id,
      status: "failed",
      error_message: "manually cleaned up stale run",
      finished_at: new Date(),
    })
    logger.info(`Marked run ${run.id} (vendor=${run.vendor_code}, status=${run.status}) as failed.`)
  }

  logger.info(`Cleaned up ${staleRuns.length} stale run(s). You can now re-run the dry-run.`)
}
