import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"
import { computeDiff } from "../modules/vendor-sync/pipeline/diff"
import { applyChanges } from "../modules/vendor-sync/pipeline/apply"

const ALLOWED_STATUSES = ["completed", "diffing", "failed"]

function printUsage(logger: any): void {
  logger.error(
    "Usage: medusa exec ./src/scripts/vendor-sync-apply.ts <run-id>"
  )
  logger.error("")
  logger.error(
    "  <run-id>   The run id printed by vendor-sync-dry-run, e.g. 01KS3PW3MZQ8RP0K28QEAHTYZP."
  )
  logger.error("")
  logger.error(
    `The run must be in one of these statuses: ${ALLOWED_STATUSES.join(", ")}.`
  )
}

function looksLikeRunId(arg: string | undefined): boolean {
  if (!arg) return false
  if (arg.endsWith(".ts") || arg.endsWith(".js")) return false
  if (arg.startsWith("-")) return false
  return /^[0-9A-Za-z]{20,32}$/.test(arg)
}

export default async function vendorSyncApply({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const vendorSyncService = container.resolve(VENDOR_SYNC_MODULE) as any

  const runId = process.argv[process.argv.length - 1]
  if (!looksLikeRunId(runId)) {
    printUsage(logger)
    return
  }

  const [run] = await vendorSyncService.listVendorFeedRuns(
    { id: runId },
    { take: 1 }
  )
  if (!run) {
    logger.error(`[apply] Run not found: ${runId}`)
    return
  }

  if (!ALLOWED_STATUSES.includes(run.status)) {
    logger.error(
      `[apply] Run ${runId} is in status "${run.status}". ` +
        `Expected one of: ${ALLOWED_STATUSES.join(", ")}.`
    )
    return
  }

  const vendorCode = run.vendor_code
  logger.info("")
  logger.info("Vendor Sync Apply")
  logger.info("=================")
  logger.info(`Vendor:        ${vendorCode}`)
  logger.info(`Run ID:        ${runId}`)
  logger.info(`Source file:   ${run.source_filename}`)
  logger.info(`Run date:      ${run.run_date_vendor ?? "(unknown)"}`)
  logger.info(
    `Staged counts: ${run.new_count} new, ${run.changed_count} changed, ${run.discontinued_count} discontinued`
  )
  logger.info(
    `Skipped:       ${run.skipped_no_image_count} (no image)`
  )
  logger.info("=================")
  logger.info("")

  const startTime = Date.now()

  try {
    await vendorSyncService.updateVendorFeedRuns({
      id: runId,
      status: "applying",
    })

    logger.info(`[apply] Re-computing diff against current state...`)
    const diff = await computeDiff(vendorSyncService, runId, vendorCode)

    logger.info(
      `[apply] Diff: ${diff.newPartNumbers.length} new, ` +
        `${diff.changedPartNumbers.length} changed, ` +
        `${diff.discontinuedPartNumbers.length} discontinued`
    )

    const result = await applyChanges(
      container,
      vendorSyncService,
      runId,
      vendorCode,
      diff,
      logger
    )

    if (result.cancelled) {
      // The cancel route already wrote status=cancelled and finished_at.
      // Only enrich with the partial-progress failed_part_numbers.
      if (result.errors.length > 0) {
        await vendorSyncService.updateVendorFeedRuns({
          id: runId,
          failed_part_numbers: result.errors,
        })
      }
    } else {
      await vendorSyncService.updateVendorFeedRuns({
        id: runId,
        status: "completed",
        finished_at: new Date(),
        failed_part_numbers:
          result.errors.length > 0 ? result.errors : null,
      })
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    logger.info("")
    logger.info("Vendor Sync Apply Summary")
    logger.info("=========================")
    logger.info(`Vendor:              ${vendorCode}`)
    logger.info(`Run ID:              ${runId}`)
    logger.info(`Final status:        ${result.cancelled ? "cancelled" : "completed"}`)
    logger.info(`Processed:           ${result.processedCount}`)
    logger.info(`Errors:              ${result.errorCount}`)
    logger.info(`Duration:            ${elapsed}s`)
    if (result.errors.length > 0) {
      const grouped = new Map<string, string[]>()
      for (const err of result.errors) {
        const list = grouped.get(err.error) ?? []
        list.push(err.partNumber)
        grouped.set(err.error, list)
      }
      logger.info("Errors by message:")
      const sortedGroups = Array.from(grouped.entries()).sort(
        (a, b) => b[1].length - a[1].length
      )
      for (const [message, partNumbers] of sortedGroups) {
        logger.info(`  [${partNumbers.length}x] ${message}`)
        for (const pn of partNumbers.slice(0, 3)) {
          logger.info(`     - ${pn}`)
        }
        if (partNumbers.length > 3) {
          logger.info(`     - ...and ${partNumbers.length - 3} more`)
        }
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
