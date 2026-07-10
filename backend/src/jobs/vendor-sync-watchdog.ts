import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"
import { EmailTemplates } from "../modules/email-notifications/templates"
import { EMAIL_REPLY_TO, OPS_ALERT_EMAIL } from "../lib/constants"
import {
  selectFailedRuns,
  selectStaleVendors,
} from "../modules/vendor-sync/alerts/watchdog-logic"

/**
 * Vendor-sync watchdog (WB-081): the feed pipeline previously failed into
 * Railway logs only — a dead SFTP credential could go unnoticed for days.
 * Hourly, this job emails OPS_ALERT_EMAIL (via the existing Notification
 * module) about:
 *  - runs that landed failed / partially_failed / exhausted in the last
 *    window (65 min = interval + slack; a boundary run may alert twice —
 *    better twice than never), and
 *  - once a day (13:00 UTC tick), vendors with no completed FULL sync in
 *    >26h (the 12h cron writes a completed run even for unchanged feeds, so
 *    silence = the cron/feed is genuinely broken).
 *
 * Degrades quietly: no OPS_ALERT_EMAIL, vendor-sync module not registered,
 * or nothing to report → no-op. Alerts pending but no Notification module
 * (RESEND_* unset) → loud error log, since that is itself a config gap.
 */

const FAILURE_WINDOW_MS = 65 * 60 * 1000
const STALE_AFTER_MS = 26 * 60 * 60 * 1000
const STALE_CHECK_UTC_HOUR = 13
const RUNS_TO_SCAN = 300 // ~a week of runs for two vendors (2 full + 8 stock/day each)

export default async function vendorSyncWatchdog(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!OPS_ALERT_EMAIL) return // alerting not configured — stay silent

  let service: any
  try {
    service = container.resolve(VENDOR_SYNC_MODULE)
  } catch {
    return // vendor-sync module not registered (VENDOR_*_ENABLED unset)
  }

  const enabledVendors: string[] = service.listEnabledVendors()
  if (!enabledVendors.length) return

  const now = Date.now()
  const runs = await service.listVendorFeedRuns(
    { vendor_code: enabledVendors },
    { order: { finished_at: "DESC" }, take: RUNS_TO_SCAN }
  )

  const failed = selectFailedRuns(runs, { now, windowMs: FAILURE_WINDOW_MS })
  const stale =
    new Date(now).getUTCHours() === STALE_CHECK_UTC_HOUR
      ? selectStaleVendors(runs, enabledVendors, { now, maxAgeMs: STALE_AFTER_MS })
      : []

  if (!failed.length && !stale.length) return

  let notification: any
  try {
    notification = container.resolve(Modules.NOTIFICATION)
  } catch {
    logger.error(
      `[vendor-sync-watchdog] ${failed.length} failed run(s) / ${stale.length} stale vendor(s) to report but no Notification module is registered — set RESEND_API_KEY + RESEND_FROM_EMAIL.`
    )
    return
  }

  const toIso = (d: Date | string | null | undefined): string | null =>
    d == null ? null : d instanceof Date ? d.toISOString() : String(d)

  const subjectParts = [
    failed.length ? `${failed.length} failed run(s)` : null,
    stale.length ? `${stale.length} stale vendor(s)` : null,
  ].filter(Boolean)

  try {
    await notification.createNotifications({
      to: OPS_ALERT_EMAIL,
      channel: "email",
      template: EmailTemplates.VENDOR_SYNC_ALERT,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: `[vendor-sync] ${subjectParts.join(" · ")}`,
        },
        failedRuns: failed.map((r) => ({
          runId: r.id,
          vendorCode: r.vendor_code,
          status: r.status,
          errorMessage: r.error_message ?? null,
          finishedAt: toIso(r.finished_at),
        })),
        staleVendors: stale.map((v) => ({
          vendorCode: v.vendorCode,
          lastFullSuccessAt:
            v.lastFullSuccessAt == null ? null : new Date(v.lastFullSuccessAt).toISOString(),
        })),
        preview: "Vendor sync needs attention",
      },
    })
    logger.info(
      `[vendor-sync-watchdog] alerted ${OPS_ALERT_EMAIL}: ${subjectParts.join(" · ")}`
    )
  } catch (err: any) {
    logger.error(`[vendor-sync-watchdog] failed to send alert: ${err?.message}`)
  }
}

export const config = {
  name: "vendor-sync-watchdog",
  schedule: "0 * * * *",
}
