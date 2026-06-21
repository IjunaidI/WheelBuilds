import { MedusaService } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import VendorFeedRun from "./models/vendor-feed-run"
import VendorFeedStaging from "./models/vendor-feed-staging"
import VendorStockStaging from "./models/vendor-stock-staging"
import VendorProductCurrent from "./models/vendor-product-current"
import { resolveAdapter } from "./adapters/registry"
import { fetchFeed } from "./pipeline/fetch"
import { stageFeed } from "./pipeline/stage"
import { computeGroupDiff, GroupDiffResult } from "./pipeline/diff"
import { applyChanges } from "./pipeline/apply"
import { resolveApplyContainer } from "./pipeline/resolve-apply-container"
import { resolveFeed, isSampleFeedPath } from "./feed-source/resolve-feed"
import { SftpConfig } from "./feed-source/types"
import { finalizeApply } from "./pipeline/finalize-apply"
import { shouldShortCircuitFeed } from "./pipeline/retry-policy"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

export interface VendorSyncModuleOptions {
  discontinueThreshold?: number
  applyConcurrency?: number
  /** WB-016: max apply attempts per feed before a partial failure becomes `exhausted` (default 3). */
  applyMaxAttempts?: number
  archiveBucket?: string
  dryRun?: boolean
  /**
   * Dev/test only: cap how many CSV rows the staging step consumes so local
   * runs finish fast. Set from medusa-config when NODE_ENV !== 'production'.
   * Undefined in production => full feed is staged.
   */
  devMaxRows?: number
  /** WB-041: permit the bundled sample CSV when no live feed is configured (dev/CI only). */
  allowSampleFeed?: boolean
  vendors?: Record<
    string,
    { enabled?: boolean; feedPath?: string; sftp?: SftpConfig }
  >
}

const IN_PROGRESS_STATUSES = ["fetching", "staging", "diffing", "applying"]

class VendorSyncService extends MedusaService({
  VendorFeedRun,
  VendorFeedStaging,
  VendorStockStaging,
  VendorProductCurrent,
}) {
  private container_: any
  private logger_: Logger
  private options_: VendorSyncModuleOptions
  /**
   * In-memory set of run ids that have been requested to cancel. Lives
   * for the lifetime of this service instance (i.e. this process). The
   * apply loop checks this between part_numbers so cancel-while-applying
   * stops cleanly instead of running to completion.
   */
  private cancelledRuns_: Set<string> = new Set()

  constructor(container: any, options: any) {
    super(...arguments)
    this.container_ = container
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
   * Mark a run as cancelled so the apply loop sees it on its next
   * iteration. The cancel endpoint calls this before flipping the DB
   * status. Idempotent.
   */
  markCancelled(runId: string): void {
    this.cancelledRuns_.add(runId)
  }

  /**
   * True if markCancelled was called for this runId. The apply loop
   * polls this between part_numbers.
   */
  isCancelled(runId: string): boolean {
    return this.cancelledRuns_.has(runId)
  }

  /**
   * Forget the cancel flag for a runId. Called from the run terminator
   * after the run row reaches a terminal status so the set doesn't grow
   * indefinitely.
   */
  private clearCancelled_(runId: string): void {
    this.cancelledRuns_.delete(runId)
  }

  /**
   * Orchestrate a full vendor sync run: fetch -> stage -> diff.
   * Transitions the run through status states and handles errors.
   */
  async run(
    vendorCode: string,
    options?: { dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }
  ): Promise<{ runId: string }> {
    const isDryRun = options?.dryRun ?? this.options_.dryRun ?? false
    const allowSample =
      options?.allowSample ?? this.options_.allowSampleFeed ?? false
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
    const run = await (this as any).createVendorFeedRuns({
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

    const startTime = Date.now()

    try {
      // 3. Resolve the feed source (local file or SFTP newest) with delta short-circuit
      const vendorOpts = (this.options_.vendors ?? {})[vendorCode] ?? {}
      const [lastForDelta] = await (this as any).listVendorFeedRuns(
        { vendor_code: vendorCode, status: "completed" },
        { order: { started_at: "DESC" }, take: 1 }
      )
      const lastSeen = lastForDelta?.source_filename
        ? { name: lastForDelta.source_filename, modifyTime: Number(lastForDelta.source_modify_time ?? 0) }
        : null

      const feed = await resolveFeed(
        { feedPath: vendorOpts.feedPath, sftp: vendorOpts.sftp },
        lastSeen,
        { allowSample, vendorCode }
      )

      const usingSample =
        feed.kind === "default" ||
        (feed.kind === "file" && isSampleFeedPath(feed.csvPath))
      if (usingSample) {
        // Reached only when allowSample === true (the guard throws otherwise).
        this.logger_.warn(
          `[vendor-sync] [${runId}] USING BUNDLED SAMPLE FEED for ${vendorCode} — ` +
            `VENDOR_ALLOW_SAMPLE_FEED is enabled; this is NOT live inventory.`
        )
      }

      if (feed.kind === "empty") {
        this.logger_.warn(`[vendor-sync] [${runId}] no feed file found for ${vendorCode}`)
        await (this as any).updateVendorFeedRuns({
          id: runId, status: "completed", error_message: "no feed file found", finished_at: new Date(),
        })
        return { runId }
      }

      if (feed.kind === "unchanged") {
        const durationMs = Date.now() - startTime
        this.logger_.info(
          `[vendor-sync] [${runId}] stage=short-circuited reason=sftp-unchanged vendor=${vendorCode} file=${feed.sourceName} durationMs=${durationMs}`
        )
        await (this as any).updateVendorFeedRuns({
          id: runId, status: "completed",
          source_filename: feed.sourceName, source_modify_time: String(feed.modifyTime),
          finished_at: new Date(),
        })
        return { runId }
      }

      const adapter = resolveAdapter(
        vendorCode,
        feed.kind === "file" ? { csvPath: feed.csvPath } : undefined
      )

      if (feed.kind === "file" && feed.modifyTime != null) {
        await (this as any).updateVendorFeedRuns({ id: runId, source_modify_time: String(feed.modifyTime) })
      }

      // 4. Fetch
      this.logger_.info(
        `[vendor-sync] [${runId}] stage=fetching vendor=${vendorCode}`
      )
      const descriptor = await fetchFeed(adapter)
      this.logger_.info(
        `[vendor-sync] [${runId}] stage=fetched vendor=${vendorCode} file=${descriptor.sourceFilename} bytes=${descriptor.byteLength} archiveKey=${descriptor.archiveKey}`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        source_filename: descriptor.sourceFilename,
        source_archive_key: descriptor.archiveKey,
      })

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
        // Short-circuit only when this feed has already reached a "done" state
        // (completed or exhausted). A partially_failed latest run for the same
        // feed must fall through so this cycle retries the failed groups (WB-016).
        const recentRuns = await (this as any).listVendorFeedRuns(
          { vendor_code: vendorCode },
          { order: { started_at: "DESC" }, take: 25 }
        )
        const latestSameFeed = recentRuns.find(
          (r: any) =>
            r.id !== runId &&
            r.run_date_vendor != null &&
            new Date(r.run_date_vendor).getTime() ===
              new Date(runDateVendor).getTime()
        )
        if (shouldShortCircuitFeed(latestSameFeed?.status)) {
          const durationMs = Date.now() - startTime
          this.logger_.info(
            `[vendor-sync] [${runId}] stage=short-circuited vendor=${vendorCode} feedDate=${runDateVendor.toISOString()} priorStatus=${latestSameFeed?.status} durationMs=${durationMs}`
          )
          await (this as any).updateVendorFeedRuns({
            id: runId,
            status: "completed",
            run_date_vendor: runDateVendor,
            finished_at: new Date(),
          })
          return { runId }
        }
      }

      // Transition to staging
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "staging",
        run_date_vendor: runDateVendor,
      })

      // 6. Stage
      const devMaxRows = this.options_.devMaxRows
      this.logger_.info(
        `[vendor-sync] [${runId}] stage=staging vendor=${vendorCode}` +
          (devMaxRows ? ` devMaxRows=${devMaxRows}` : '')
      )
      await stageFeed(adapter, descriptor, this, runId, this.logger_, devMaxRows)

      // Transition to diffing
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "diffing",
      })

      // 7. Diff
      this.logger_.info(
        `[vendor-sync] [${runId}] stage=diffing vendor=${vendorCode}`
      )
      const diff = await computeGroupDiff(this, runId, vendorCode)
      const counts = countDiffParts(diff)
      await (this as any).updateVendorFeedRuns({
        id: runId,
        new_count: counts.newCount,
        changed_count: counts.changedCount,
        discontinued_count: counts.discontinuedCount,
      })

      this.logger_.info(
        `[vendor-sync] [${runId}] stage=diffed vendor=${vendorCode} ` +
          `newGroups=${diff.newGroups.length} changedGroups=${diff.changedGroups.length} discontinuedGroups=${diff.discontinuedGroups.length} ` +
          `newParts=${counts.newCount} changedParts=${counts.changedCount} discontinuedParts=${counts.discontinuedCount}`
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
        counts.discontinuedCount / currentCount > threshold
      ) {
        this.logger_.warn(
          `[vendor-sync] [${runId}] Discontinue ratio ` +
            `${counts.discontinuedCount}/${currentCount} ` +
            `exceeds threshold ${threshold}. Awaiting approval.`
        )
        await (this as any).updateVendorFeedRuns({
          id: runId,
          status: "awaiting_approval",
        })
        return { runId }
      }

      // 9. Dry run: mark completed and return
      if (isDryRun) {
        const durationMs = Date.now() - startTime
        this.logger_.info(
          `[vendor-sync] [${runId}] stage=completed vendor=${vendorCode} dryRun=true durationMs=${durationMs}`
        )
        await (this as any).updateVendorFeedRuns({
          id: runId,
          status: "completed",
          finished_at: new Date(),
        })
        return { runId }
      }

      // 10. Transition to applying
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "applying",
      })

      this.logger_.info(
        `[vendor-sync] [${runId}] stage=applying vendor=${vendorCode}`
      )
      const applyResult = await applyChanges(
        resolveApplyContainer(options?.container, this.container_),
        this,
        runId,
        vendorCode,
        diff,
        this.logger_
      )

      const durationMs = Date.now() - startTime
      this.logger_.info(
        `[vendor-sync] [${runId}] stage=${applyResult.cancelled ? "cancelled" : "completed"} vendor=${vendorCode} processed=${applyResult.processedCount} errors=${applyResult.errorCount} durationMs=${durationMs}`
      )

      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: runDateVendor,
        result: applyResult,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })

      this.clearCancelled_(runId)
      return { runId }
    } catch (err: any) {
      const durationMs = Date.now() - startTime
      this.logger_.error(
        `[vendor-sync] [${runId}] stage=failed vendor=${vendorCode} error="${err.message}" durationMs=${durationMs}`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "failed",
        error_message: err.message?.slice(0, 2000),
        finished_at: new Date(),
      }).catch((updateErr: any) => {
        this.logger_.error(
          `[vendor-sync] [${runId}] Failed to update run status: ${updateErr.message}`
        )
      })
      this.clearCancelled_(runId)
      return { runId }
    }
  }

  /**
   * Approve a paused run (awaiting_approval) and apply its diff.
   * Re-computes the diff from existing staging data, then applies.
   */
  async approveAndApply(
    runId: string,
    actorId?: string,
    container?: MedusaContainer
  ): Promise<void> {
    // Record who approved and when
    await (this as any).updateVendorFeedRuns({
      id: runId,
      status: "applying",
      approved_by: actorId ?? "admin",
      approved_at: new Date(),
    })

    try {
      const [run] = await (this as any).listVendorFeedRuns({ id: runId })
      const vendorCode = run.vendor_code

      // Re-compute diff from existing staging data
      const diff = await computeGroupDiff(this, runId, vendorCode)
      const counts = countDiffParts(diff)

      this.logger_.info(
        `[vendor-sync] [${runId}] Approved. Applying: ` +
          `newGroups=${diff.newGroups.length} changedGroups=${diff.changedGroups.length} discontinuedGroups=${diff.discontinuedGroups.length} ` +
          `newParts=${counts.newCount} changedParts=${counts.changedCount} discontinuedParts=${counts.discontinuedCount}`
      )

      const result = await applyChanges(
        resolveApplyContainer(container, this.container_),
        this,
        runId,
        vendorCode,
        diff,
        this.logger_
      )

      this.logger_.info(
        `[vendor-sync] [${runId}] Apply ${result.cancelled ? "cancelled" : "complete"}: ${result.processedCount} processed, ${result.errorCount} errors`
      )

      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: run.run_date_vendor ? new Date(run.run_date_vendor) : null,
        result,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
      this.clearCancelled_(runId)
    } catch (err: any) {
      this.logger_.error(
        `[vendor-sync] [${runId}] Apply after approval failed: ${err.message}`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "failed",
        error_message: err.message?.slice(0, 2000),
        finished_at: new Date(),
      }).catch(() => {})
      this.clearCancelled_(runId)
      throw err
    }
  }

  /**
   * Replay a completed or failed run: re-diff from existing staging data
   * and re-apply all changes.
   */
  async replayRun(runId: string, container?: MedusaContainer): Promise<void> {
    const [run] = await (this as any).listVendorFeedRuns({ id: runId })
    if (!run) throw new Error(`Run ${runId} not found`)

    const vendorCode = run.vendor_code

    await (this as any).updateVendorFeedRuns({
      id: runId,
      status: "applying",
      finished_at: null,
    })

    try {
      const diff = await computeGroupDiff(this, runId, vendorCode)
      const counts = countDiffParts(diff)

      this.logger_.info(
        `[vendor-sync] [${runId}] Replaying: ` +
          `newGroups=${diff.newGroups.length} changedGroups=${diff.changedGroups.length} discontinuedGroups=${diff.discontinuedGroups.length} ` +
          `newParts=${counts.newCount} changedParts=${counts.changedCount} discontinuedParts=${counts.discontinuedCount}`
      )

      const result = await applyChanges(
        resolveApplyContainer(container, this.container_),
        this,
        runId,
        vendorCode,
        diff,
        this.logger_
      )

      this.logger_.info(
        `[vendor-sync] [${runId}] Replay ${result.cancelled ? "cancelled" : "complete"}: ${result.processedCount} processed, ${result.errorCount} errors`
      )

      await finalizeApply(this as any, {
        runId,
        vendorCode,
        feedDate: run.run_date_vendor ? new Date(run.run_date_vendor) : null,
        result,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
      this.clearCancelled_(runId)
    } catch (err: any) {
      this.logger_.error(
        `[vendor-sync] [${runId}] Replay failed: ${err.message}`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "failed",
        error_message: err.message?.slice(0, 2000),
        finished_at: new Date(),
      }).catch(() => {})
      this.clearCancelled_(runId)
      throw err
    }
  }

  /**
   * Replay a single SKU: find the most recent staging row, classify it
   * against the current state, and apply the appropriate action.
   */
  async replaySku(
    vendorCode: string,
    partNumber: string,
    container?: MedusaContainer
  ): Promise<void> {
    // Find the most recent staging row for this vendor + part number
    const [stagingRow] = await (this as any).listVendorFeedStagings(
      { vendor_code: vendorCode, part_number: partNumber },
      { order: { created_at: "DESC" }, take: 1 }
    )

    if (!stagingRow) {
      throw new Error(
        `No staging data found for vendor=${vendorCode}, part_number=${partNumber}`
      )
    }

    const runId = stagingRow.run_id

    // Get current row for this part number
    const [currentRow] = await (this as any).listVendorProductCurrents(
      { vendor_code: vendorCode, part_number: partNumber },
      { take: 1 }
    )

    // Classify: if no current row -> new, if hash differs -> changed
    const isNew = !currentRow || currentRow.discontinued_at !== null
    const isChanged =
      currentRow &&
      currentRow.discontinued_at === null &&
      currentRow.content_hash !== stagingRow.content_hash

    if (!isNew && !isChanged) {
      this.logger_.info(
        `[vendor-sync] SKU ${partNumber} is unchanged, nothing to replay`
      )
      return
    }

    // Build a minimal group-aware diff and apply. A single-SKU replay
    // is always a one-variant group (either new or changed inside an
    // existing group).
    const groupKey = stagingRow.group_key
    const diff: GroupDiffResult = isNew
      ? {
          newGroups: currentRow
            ? // The current row exists but is discontinued; treat as
              // re-adding to the existing group. Use the changedGroup
              // path with added_part_numbers.
              []
            : [{ group_key: groupKey, part_numbers: [partNumber] }],
          changedGroups: currentRow
            ? [
                {
                  group_key: groupKey,
                  added_part_numbers: [partNumber],
                  removed_part_numbers: [],
                  changed_part_numbers: [],
                },
              ]
            : [],
          discontinuedGroups: [],
        }
      : {
          newGroups: [],
          changedGroups: [
            {
              group_key: groupKey,
              added_part_numbers: [],
              removed_part_numbers: [],
              changed_part_numbers: [partNumber],
            },
          ],
          discontinuedGroups: [],
        }

    this.logger_.info(
      `[vendor-sync] Replaying SKU ${partNumber} (${isNew ? "new" : "changed"}) in group ${groupKey} from run ${runId}`
    )

    await applyChanges(
      resolveApplyContainer(container, this.container_),
      this,
      runId,
      vendorCode,
      diff,
      this.logger_
    )
  }
}

/**
 * Roll a GroupDiffResult up into part-number-level counters so the
 * vendor_feed_run row keeps the pre-grouping semantic (admin UI reads
 * "new_count" as a SKU count, not a group count). Removed variants from
 * a still-alive group count as discontinued.
 */
function countDiffParts(diff: GroupDiffResult): {
  newCount: number
  changedCount: number
  discontinuedCount: number
} {
  let newCount = 0
  let changedCount = 0
  let discontinuedCount = 0
  for (const g of diff.newGroups) newCount += g.part_numbers.length
  for (const g of diff.changedGroups) {
    newCount += g.added_part_numbers.length
    changedCount += g.changed_part_numbers.length
    discontinuedCount += g.removed_part_numbers.length
  }
  for (const g of diff.discontinuedGroups)
    discontinuedCount += g.part_numbers.length
  return { newCount, changedCount, discontinuedCount }
}

export default VendorSyncService
