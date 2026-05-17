import { MedusaService } from "@medusajs/framework/utils"
import VendorFeedRun from "./models/vendor-feed-run"
import VendorFeedStaging from "./models/vendor-feed-staging"
import VendorStockStaging from "./models/vendor-stock-staging"
import VendorProductCurrent from "./models/vendor-product-current"
import { resolveAdapter } from "./adapters/registry"
import { fetchFeed } from "./pipeline/fetch"
import { stageFeed } from "./pipeline/stage"
import { computeDiff } from "./pipeline/diff"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

export interface VendorSyncModuleOptions {
  discontinueThreshold?: number
  applyConcurrency?: number
  archiveBucket?: string
  dryRun?: boolean
  vendors?: Record<
    string,
    { enabled?: boolean; feedPath?: string }
  >
}

const IN_PROGRESS_STATUSES = ["fetching", "staging", "diffing", "applying"]

class VendorSyncService extends MedusaService({
  VendorFeedRun,
  VendorFeedStaging,
  VendorStockStaging,
  VendorProductCurrent,
}) {
  private logger_: Logger
  private options_: VendorSyncModuleOptions

  constructor(container: any, options: any) {
    super(...arguments)
    this.logger_ = container.logger ?? {
      info: console.log,
      warn: console.warn,
      error: console.error,
    }
    this.options_ = (options ?? {}) as VendorSyncModuleOptions
  }

  /**
   * Return vendor codes where enabled is true in module options.
   */
  listEnabledVendors(): string[] {
    const vendors = this.options_.vendors ?? {}
    return Object.entries(vendors)
      .filter(([, cfg]) => cfg.enabled)
      .map(([code]) => code)
  }

  /**
   * Orchestrate a full vendor sync run: fetch -> stage -> diff.
   * Transitions the run through status states and handles errors.
   */
  async run(
    vendorCode: string,
    options?: { dryRun?: boolean }
  ): Promise<{ runId: string }> {
    const isDryRun = options?.dryRun ?? this.options_.dryRun ?? false
    const threshold = this.options_.discontinueThreshold ?? 0.05

    // 1. In-progress guard
    const inProgress = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode, status: IN_PROGRESS_STATUSES },
      { take: 1 }
    )
    if (inProgress.length > 0) {
      this.logger_.warn(
        `[vendor-sync] Run already in progress for ${vendorCode} (run ${inProgress[0].id}, status ${inProgress[0].status}). Skipping.`
      )
      return { runId: inProgress[0].id }
    }

    // 2. Create run row
    const [run] = await (this as any).createVendorFeedRuns({
      vendor_code: vendorCode,
      source_filename: "",
      status: "fetching",
      started_at: new Date(),
      row_count: 0,
      skipped_no_image_count: 0,
      hash_match_count: 0,
      new_count: 0,
      changed_count: 0,
      discontinued_count: 0,
    })
    const runId = run.id

    try {
      // 3. Resolve adapter
      const adapter = resolveAdapter(vendorCode)

      // 4. Fetch
      this.logger_.info(`[vendor-sync] [${runId}] Fetching feed for ${vendorCode}...`)
      const descriptor = await fetchFeed(adapter)
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        {
          source_filename: descriptor.sourceFilename,
          source_archive_key: descriptor.archiveKey,
        }
      )

      // 5. RunDate short-circuit
      // Parse runDateVendor from a sample row (first parsed row)
      let runDateVendor: Date | null = null
      for await (const parsedRow of adapter.parse(descriptor)) {
        try {
          const normalized = adapter.normalize(parsedRow)
          runDateVendor = normalized.runDateVendor
        } catch {
          // skip un-normalizable rows, keep looking
          continue
        }
        break
      }

      if (runDateVendor) {
        // Check the most recent completed run for this vendor
        const [lastCompleted] = await (this as any).listVendorFeedRuns(
          { vendor_code: vendorCode, status: "completed" },
          { order: { started_at: "DESC" }, take: 1 }
        )
        if (
          lastCompleted?.run_date_vendor &&
          new Date(lastCompleted.run_date_vendor).getTime() ===
            new Date(runDateVendor).getTime()
        ) {
          this.logger_.info(
            `[vendor-sync] [${runId}] Feed date ${runDateVendor.toISOString()} matches last completed run. Short-circuiting.`
          )
          await (this as any).updateVendorFeedRuns(
            { id: runId },
            {
              status: "completed",
              run_date_vendor: runDateVendor,
              finished_at: new Date(),
            }
          )
          return { runId }
        }
      }

      // Transition to staging
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        { status: "staging", run_date_vendor: runDateVendor }
      )

      // 6. Stage
      this.logger_.info(`[vendor-sync] [${runId}] Staging feed...`)
      await stageFeed(adapter, descriptor, this, runId, this.logger_)

      // Transition to diffing
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        { status: "diffing" }
      )

      // 7. Diff
      this.logger_.info(`[vendor-sync] [${runId}] Computing diff...`)
      const diff = await computeDiff(this, runId, vendorCode)
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        {
          new_count: diff.newPartNumbers.length,
          changed_count: diff.changedPartNumbers.length,
          discontinued_count: diff.discontinuedPartNumbers.length,
        }
      )

      this.logger_.info(
        `[vendor-sync] [${runId}] Diff: ${diff.newPartNumbers.length} new, ` +
          `${diff.changedPartNumbers.length} changed, ` +
          `${diff.discontinuedPartNumbers.length} discontinued`
      )

      // 8. Threshold check
      // Count active current rows for this vendor
      const currentRows = await (this as any).listVendorProductCurrents(
        { vendor_code: vendorCode, discontinued_at: null },
        { select: ["id"], take: null }
      )
      const currentCount = currentRows.length

      if (
        currentCount > 0 &&
        diff.discontinuedPartNumbers.length / currentCount > threshold
      ) {
        this.logger_.warn(
          `[vendor-sync] [${runId}] Discontinue ratio ` +
            `${diff.discontinuedPartNumbers.length}/${currentCount} ` +
            `exceeds threshold ${threshold}. Awaiting approval.`
        )
        await (this as any).updateVendorFeedRuns(
          { id: runId },
          { status: "awaiting_approval" }
        )
        return { runId }
      }

      // 9. Dry run: mark completed and return
      if (isDryRun) {
        await (this as any).updateVendorFeedRuns(
          { id: runId },
          { status: "completed", finished_at: new Date() }
        )
        return { runId }
      }

      // 10. Transition to applying (apply logic is PR 4+)
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        { status: "applying" }
      )

      // Apply step placeholder -- will be implemented in PR 4
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        { status: "completed", finished_at: new Date() }
      )

      return { runId }
    } catch (err: any) {
      this.logger_.error(
        `[vendor-sync] [${runId}] Run failed: ${err.message}`
      )
      await (this as any).updateVendorFeedRuns(
        { id: runId },
        {
          status: "failed",
          error_message: err.message?.slice(0, 2000),
          finished_at: new Date(),
        }
      ).catch((updateErr: any) => {
        this.logger_.error(
          `[vendor-sync] [${runId}] Failed to update run status: ${updateErr.message}`
        )
      })
      return { runId }
    }
  }
}

export default VendorSyncService
