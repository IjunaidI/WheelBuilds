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
import { shouldShortCircuitFeed, terminalStatusForFeed } from "./pipeline/retry-policy"
import { uploadArchive } from "./utils/archive"
import { shouldUploadArchive } from "./utils/archive-policy"
import { selectStockPartNumbers, stockOnlyPartsToApply } from "./pipeline/stock-select"
import { applyStockLevels } from "./pipeline/apply-stock"
import { ensureDefaultSalesChannel } from "./pipeline/bootstrap"
import {
  IN_PROGRESS_STATUSES,
  BLOCKING_STATUSES,
  isVendorBusy,
  isRunSuperseded,
  canApprove,
} from "./pipeline/lifecycle-guards"

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
  /** WB-017: explicit opt-in to durably upload the fetched feed archive to object storage (private bucket only). */
  durableArchive?: boolean
  vendors?: Record<
    string,
    { enabled?: boolean; feedPath?: string; sftp?: SftpConfig }
  >
}

class VendorSyncService extends MedusaService({
  VendorFeedRun,
  VendorFeedStaging,
  VendorStockStaging,
  VendorProductCurrent,
}) {
  private container_: any
  private logger_: Logger
  private options_: VendorSyncModuleOptions

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

  /** WB-037: persist the cancel signal so it survives across processes/restarts. */
  async markCancelled(runId: string): Promise<void> {
    await (this as any).updateVendorFeedRuns({ id: runId, cancel_requested_at: new Date() })
  }

  /** WB-037: the apply loop polls this at group boundaries. */
  async isCancelled(runId: string): Promise<boolean> {
    const [run] = await (this as any).listVendorFeedRuns({ id: runId }, { take: 1 })
    return !!run?.cancel_requested_at
  }

  /** WB-011: apply concurrency knob (consumed by the apply loop). */
  getApplyConcurrency(): number {
    return this.options_.applyConcurrency ?? 8
  }

  /**
   * WB-011: reserve a run — the in-progress guard + create-run-row half of the
   * old `run()`. Returns the existing run's id with `inProgress:true` when the
   * guard hits, otherwise a freshly-created run id with `inProgress:false`.
   */
  async startRun(
    vendorCode: string,
    mode: string = "full"
  ): Promise<{ runId: string; inProgress: boolean }> {
    // 1. In-progress guard (F8: awaiting_approval also blocks new runs — a
    // parked run must stop a newer feed from applying underneath it, which
    // would make approving the parked run a silent catalog rollback).
    // Stock-only runs are the exception: they never write settleHash (no
    // content_hash/discontinued_at/product-state mutation), so they can't
    // change the diff baseline a later approval re-computes. Blocking them
    // on a merely-parked awaiting_approval run would freeze inventory for
    // as long as the park lasts. A concurrently-APPLYING run must still
    // block a stock-only run (F9), hence IN_PROGRESS_STATUSES rather than
    // no guard at all.
    const guardStatuses =
      mode === "stock" ? IN_PROGRESS_STATUSES : BLOCKING_STATUSES
    const inProgress = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode, status: guardStatuses },
      { take: 1 }
    )
    if (inProgress.length > 0) {
      this.logger_.warn(
        `[vendor-sync] Run already in progress for ${vendorCode} (run ${inProgress[0].id}, status ${inProgress[0].status}). Skipping.`
      )
      return { runId: inProgress[0].id, inProgress: true }
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
      mode,
    })
    return { runId: run.id, inProgress: false }
  }

  /**
   * WB-011: the fetch -> stage -> diff -> apply pipeline for an already-reserved
   * run. Extracted verbatim from the old `run()` try/catch body. Callers reserve
   * the run id via `startRun` first, then invoke this with a container that can
   * resolve core modules: `run()` awaits it inline (cron — global container),
   * and the `vendor-sync.execute` subscriber fires it off-request (subscriber's
   * global container). The apply workflows need the core region/product/
   * inventory modules, which the module cradle (`this.container_`) CANNOT
   * resolve — so a real caller must always pass `options.container`; the
   * `this.container_` fallback below only keeps the signature total.
   */
  async executeRun(
    runId: string,
    vendorCode: string,
    options?: { dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }
  ): Promise<void> {
    const isDryRun = options?.dryRun ?? this.options_.dryRun ?? false
    const allowSample =
      options?.allowSample ?? this.options_.allowSampleFeed ?? false
    const threshold = this.options_.discontinueThreshold ?? 0.05
    const container = options?.container ?? this.container_

    const startTime = Date.now()

    try {
      // 3. Resolve the feed source (local file or SFTP newest) with delta short-circuit
      const vendorOpts = (this.options_.vendors ?? {})[vendorCode] ?? {}
      const [lastForDelta] = await (this as any).listVendorFeedRuns(
        { vendor_code: vendorCode, status: "completed", mode: "full" },
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
        const pattern = vendorOpts.sftp?.filePattern
        const errorMessage = pattern
          ? `no feed file matched pattern: ${pattern}`
          : "no feed file matched"
        this.logger_.warn(`[vendor-sync] [${runId}] ${errorMessage} for ${vendorCode}`)
        await (this as any).updateVendorFeedRuns({
          id: runId,
          status: terminalStatusForFeed("empty"),
          error_message: errorMessage,
          finished_at: new Date(),
        })
        return
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
        return
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

      // WB-017: best-effort durable upload of the archive to object storage.
      // Explicit opt-in (durableArchive AND MinIO configured) — never write
      // vendor cost CSVs to the default public MinIO media bucket by accident.
      // descriptor.archiveKey stays a LOCAL path; only the DB column is updated.
      const durableArchive = this.options_.durableArchive ?? false
      const minioConfigured = !!(
        process.env.MINIO_ENDPOINT &&
        process.env.MINIO_ACCESS_KEY &&
        process.env.MINIO_SECRET_KEY
      )
      if (shouldUploadArchive(durableArchive, minioConfigured)) {
        const durableKey = await uploadArchive(descriptor.archiveKey, {
          vendorCode,
          bucket: this.options_.archiveBucket ?? "vendor-feeds",
        })
        if (durableKey) {
          await (this as any).updateVendorFeedRuns({ id: runId, source_archive_key: durableKey })
        }
      }

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
        // Scope to full runs: the 3h stock cron (mode:"stock") creates rows
        // ~5x faster than the 12h full sync, so an unscoped take:25 window
        // could push a matching prior full run out of view and miss the
        // RunDate short-circuit (WB-018). Stock runs never set run_date_vendor
        // anyway, so filtering them out here only restores the window.
        const recentRuns = await (this as any).listVendorFeedRuns(
          { vendor_code: vendorCode, mode: "full" },
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
          return
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

      // WB-011: honor a cancel requested during staging before diffing starts.
      if (await this.isCancelled(runId)) {
        await (this as any).updateVendorFeedRuns({ id: runId, status: "cancelled", finished_at: new Date() })
        return
      }

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

      // WB-011: honor a cancel requested during diffing before apply starts.
      if (await this.isCancelled(runId)) {
        await (this as any).updateVendorFeedRuns({ id: runId, status: "cancelled", finished_at: new Date() })
        return
      }

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
        return
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
        return
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
        container,
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

      return
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
      return
    }
  }

  /**
   * Orchestrate a full vendor sync run: fetch -> stage -> diff -> apply.
   * BLOCKING — the cron (`vendor-sync-tick`) depends on this awaiting the whole
   * pipeline and threads its own (global) container through `options.container`.
   * The off-request path for the admin route does NOT go through here: the route
   * calls `startRun` + emits `vendor-sync.execute`, and the vendor-sync
   * subscriber runs `executeRun` on its global container.
   */
  async run(
    vendorCode: string,
    options?: { dryRun?: boolean; container?: MedusaContainer; allowSample?: boolean }
  ): Promise<{ runId: string }> {
    const isDry = options?.dryRun ?? this.options_.dryRun ?? false
    const started = await this.startRun(vendorCode, isDry ? "dry" : "full")
    if (started.inProgress) return { runId: started.runId }
    await this.executeRun(started.runId, vendorCode, options)
    return { runId: started.runId }
  }

  /**
   * WB-018: stock-only fast path. Fetch + stage the feed, then apply ONLY
   * inventory levels (no product diff/create). Skipped if a run is already
   * in progress for the vendor.
   */
  async runStockOnly(
    vendorCode: string,
    options?: { container?: MedusaContainer }
  ): Promise<{ runId: string }> {
    const started = await this.startRun(vendorCode, "stock")
    if (started.inProgress) return { runId: started.runId }
    const runId = started.runId
    const container = options?.container ?? this.container_
    try {
      const vendorOpts = (this.options_.vendors ?? {})[vendorCode] ?? {}
      // WB-018 fix: give the stock-only path its own delta short-circuit,
      // scoped to the last completed STOCK run (mirrors executeRun's
      // lastForDelta, but must stay mode:"stock" — full runs never persist
      // source_modify_time on this cadence).
      const [lastStock] = await (this as any).listVendorFeedRuns(
        { vendor_code: vendorCode, status: "completed", mode: "stock" },
        { order: { started_at: "DESC" }, take: 1 }
      )
      const lastSeen = lastStock?.source_filename
        ? { name: lastStock.source_filename, modifyTime: Number(lastStock.source_modify_time ?? 0) }
        : null
      const feed = await resolveFeed(
        { feedPath: vendorOpts.feedPath, sftp: vendorOpts.sftp },
        lastSeen,
        { allowSample: this.options_.allowSampleFeed ?? false, vendorCode }
      )
      if (feed.kind === "empty" || feed.kind === "unchanged") {
        const pattern = vendorOpts.sftp?.filePattern
        const errorMessage = pattern
          ? `no feed file matched pattern: ${pattern}`
          : "no feed file matched"
        if (feed.kind === "empty") {
          this.logger_.warn(`[vendor-sync] [${runId}] ${errorMessage} for ${vendorCode}`)
        }
        await (this as any).updateVendorFeedRuns({
          id: runId,
          status: terminalStatusForFeed(feed.kind),
          finished_at: new Date(),
          // Persist the same (name, modifyTime) pair executeRun's unchanged
          // branch persists, so the NEXT stock tick's lastStock lookup still
          // resolves a non-empty source_filename and can short-circuit again
          // -- otherwise this run's blank source_filename would break the
          // chain and force a redundant download every other tick.
          ...(feed.kind === "unchanged"
            ? { source_filename: feed.sourceName, source_modify_time: String(feed.modifyTime) }
            : { error_message: errorMessage }),
        })
        return { runId }
      }
      const adapter = resolveAdapter(vendorCode, feed.kind === "file" ? { csvPath: feed.csvPath } : undefined)
      const descriptor = await fetchFeed(adapter)
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "staging",
        source_filename: descriptor.sourceFilename,
        ...(feed.kind === "file" && feed.modifyTime != null ? { source_modify_time: String(feed.modifyTime) } : {}),
      })
      await stageFeed(adapter, descriptor, this, runId, this.logger_, this.options_.devMaxRows)

      // Which staged parts have a current row? Source from vendor_feed_staging
      // (ALL parts staged this run), not vendor_stock_staging (only qoh>0 rows) —
      // else a part that sold out at every warehouse is never selected and its
      // Medusa levels stay phantom-stocked (WB-089 L5).
      const stagedRows = await (this as any).listVendorFeedStagings({ run_id: runId }, { select: ["part_number"], take: null })
      const stagedParts = stagedRows.map((r: any) => r.part_number)
      const currentRows = await (this as any).listVendorProductCurrents({ vendor_code: vendorCode }, { select: ["part_number"], take: null })
      const currentParts = new Set<string>(currentRows.map((r: any) => r.part_number))
      const parts = stockOnlyPartsToApply(stagedParts, currentParts)

      await (this as any).updateVendorFeedRuns({ id: runId, status: "applying" })
      const salesChannelId = await ensureDefaultSalesChannel(container)
      const stockResult = await applyStockLevels(container, this, runId, vendorCode, parts, salesChannelId, this.logger_)
      this.logger_.info(`[vendor-sync] [${runId}] stock-only: ${stockResult.updatedCount} updated, ${stockResult.errors.length} errors over ${parts.length} parts`)
      await (this as any).updateVendorFeedRuns({ id: runId, status: "completed", finished_at: new Date() })
      return { runId }
    } catch (err: any) {
      await (this as any).updateVendorFeedRuns({ id: runId, status: "failed", error_message: err.message?.slice(0, 2000), finished_at: new Date() }).catch(() => {})
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
    // F16: re-read — the run may have been cancelled between the 202 and this
    // subscriber firing. Do not apply a run that is no longer approvable.
    const [current] = await (this as any).listVendorFeedRuns({ id: runId })
    if (!current || !canApprove(current)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve skipped: status=${current?.status} cancel=${current?.cancel_requested_at}`
      )
      return
    }
    const vendorCode = current.vendor_code
    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    // F9: never run two apply loops for one vendor at once.
    if (isVendorBusy(vendorRuns, runId)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve skipped: another run is applying for ${vendorCode}`
      )
      return
    }
    // F8: refuse a stale approval that would roll the catalog back.
    if (isRunSuperseded(current, vendorRuns)) {
      this.logger_.warn(
        `[vendor-sync] [${runId}] approve refused: superseded by a newer completed feed`
      )
      await (this as any).updateVendorFeedRuns({
        id: runId,
        status: "superseded",
        finished_at: new Date(),
      })
      return
    }

    // Record who approved and when. WB-037: also clear any prior cancel
    // signal on this run row -- re-entering execution must not immediately
    // re-cancel itself against a stale cancel_requested_at from a previous
    // attempt on the same runId.
    await (this as any).updateVendorFeedRuns({
      id: runId,
      status: "applying",
      approved_by: actorId ?? "admin",
      approved_at: new Date(),
      cancel_requested_at: null,
    })

    try {
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
        feedDate: current.run_date_vendor ? new Date(current.run_date_vendor) : null,
        result,
        maxAttempts: this.options_.applyMaxAttempts ?? 3,
      })
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

    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    if (isVendorBusy(vendorRuns, runId)) {
      throw new Error(
        `replay refused: another run is applying for ${vendorCode}`
      )
    }

    // WB-037: clear any prior cancel signal -- see approveAndApply comment.
    await (this as any).updateVendorFeedRuns({
      id: runId,
      status: "applying",
      finished_at: null,
      cancel_requested_at: null,
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

    const vendorRuns = await (this as any).listVendorFeedRuns(
      { vendor_code: vendorCode },
      { order: { started_at: "DESC" }, take: 25 }
    )
    if (isVendorBusy(vendorRuns, runId)) {
      throw new Error(
        `replay-sku refused: another run is applying for ${vendorCode}`
      )
    }

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

    // WB-037: clear any prior cancel signal on the run row this staging
    // data belongs to -- see approveAndApply comment. replaySku reuses
    // stagingRow.run_id, so a run cancelled earlier must not immediately
    // re-cancel this single-SKU replay.
    await (this as any).updateVendorFeedRuns({ id: runId, cancel_requested_at: null })

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
