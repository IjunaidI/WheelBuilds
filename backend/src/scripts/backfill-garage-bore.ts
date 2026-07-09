// GARAGE-DISABLED (WB-076): this manual script requires the customer-vehicle
// module to be re-registered in medusa-config.js before it can run — the
// module resolve below will throw while the garage is retired.
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CUSTOMER_VEHICLE_MODULE } from "../modules/customer-vehicle"
import { WHEEL_SIZE_MODULE } from "../modules/wheel-size"
import { QuotaOutageError } from "../modules/wheel-size/service"
import { resolveOptional } from "../lib/resolve-optional"
import type WheelSizeService from "../modules/wheel-size/service"

/**
 * WB-072 B2 backfill: re-resolve fitment for existing garage vehicles to
 * recover TRUE hub-bore precision.
 *
 * Background: `customer_vehicle.hub_bore_mm` used to be an INTEGER column, so
 * a fractional wheel-size hub bore (e.g. 106.1mm) was truncated to 106 on
 * write. Migration20260707120000 renames the column to `hub_bore_mm_x100`
 * and carries the OLD (already-truncated) value forward as ×100 (106 -> 10600)
 * -- that migration alone does NOT recover the lost .1mm. This script
 * re-queries the wheel-size service (cache-through, live API on a miss) for
 * each vehicle's make/model/year(+modification_slug) and overwrites
 * hub_bore_mm_x100 with the freshly resolved, full-precision value.
 *
 * Guarded by --confirm-host=<host> whose value MUST match the host parsed out
 * of DATABASE_URL (mirrors vendor-sync-dev-wipe.ts) so a copy-paste from
 * history cannot run this against the wrong DB.
 *
 * Idempotent: safe to re-run. A vehicle whose freshly-resolved value matches
 * what's already stored is logged and left alone; a wheel-size lookup that
 * comes back not_found/no-bore-data leaves the existing value untouched
 * (never nulls out a known-if-imprecise value on a transient miss).
 *
 * Usage:
 *
 *   pnpm exec medusa exec ./src/scripts/backfill-garage-bore.ts
 *      (prints the target host + instructions; refuses to act)
 *
 *   pnpm exec medusa exec ./src/scripts/backfill-garage-bore.ts \
 *      -- --confirm-host=<the host printed above>
 *      (re-resolves + rewrites hub_bore_mm_x100 for every garage vehicle)
 */

interface ParsedDbUrl {
  display: string
  host: string
}

function parseDatabaseUrl(url: string | undefined): ParsedDbUrl | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname || "(unknown-host)"
    const port = u.port ? `:${u.port}` : ""
    const db = u.pathname?.replace(/^\//, "") || "(no-db)"
    return { display: `${u.protocol}//****@${host}${port}/${db}`, host }
  } catch {
    return null
  }
}

function extractFlag(name: string): string | null {
  for (const arg of process.argv) {
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
  }
  return null
}

export default async function backfillGarageBore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error("[backfill-garage-bore] DATABASE_URL is not a valid URL; refusing to run.")
    return
  }

  logger.info("")
  logger.info("Garage Hub-Bore Backfill (WB-072 B2)")
  logger.info("=====================================")
  logger.info(`DATABASE_URL points at: ${parsed.display}`)
  logger.info("")
  logger.info("This re-resolves wheel-size fitment for every saved garage vehicle and")
  logger.info("overwrites hub_bore_mm_x100 with the fresh, full-precision value. Vehicles")
  logger.info("whose lookup comes back without bore data are left unchanged.")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  pnpm exec medusa exec ./src/scripts/backfill-garage-bore.ts -- --confirm-host=${parsed.host}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flag)")
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[backfill-garage-bore] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  const vehicleSvc = resolveOptional<any>(container, CUSTOMER_VEHICLE_MODULE)
  if (!vehicleSvc) {
    logger.info("[backfill-garage-bore] customer-vehicle module not loaded, skipping")
    return
  }
  const wheelSizeSvc = resolveOptional<WheelSizeService>(container, WHEEL_SIZE_MODULE)
  if (!wheelSizeSvc) {
    logger.info("[backfill-garage-bore] wheel-size module not loaded (no WHEEL_SIZE_API_KEY?), skipping")
    return
  }

  const vehicles: any[] = await vehicleSvc.listCustomerVehicles({}, { take: null })
  logger.info(`[backfill-garage-bore] Found ${vehicles.length} garage vehicle(s)`)

  let updated = 0
  let unchanged = 0
  let skipped = 0
  let failed = 0

  for (const v of vehicles) {
    const label = `${v.customer_id}/${v.client_id} (${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""})`

    if (!v.make || !v.model || !v.year) {
      logger.warn(`[backfill-garage-bore] ${label}: missing make/model/year, skipping`)
      skipped++
      continue
    }

    try {
      const fitment = await wheelSizeSvc.getFitment({
        make: v.make,
        model: v.model,
        year: String(v.year),
        modificationSlug: v.modification_slug ?? undefined,
      })

      if (fitment.status !== "ok" || fitment.hubBoreMm == null) {
        logger.warn(
          `[backfill-garage-bore] ${label}: no bore data from wheel-size (status=${fitment.status}), leaving hub_bore_mm_x100=${v.hub_bore_mm_x100 ?? "null"} unchanged`
        )
        skipped++
        continue
      }

      const newX100 = Math.round(fitment.hubBoreMm * 100)
      if (newX100 === v.hub_bore_mm_x100) {
        logger.info(`[backfill-garage-bore] ${label}: already correct (${newX100}), no change`)
        unchanged++
        continue
      }

      await vehicleSvc.updateCustomerVehicles({ id: v.id, hub_bore_mm_x100: newX100 })
      logger.info(
        `[backfill-garage-bore] ${label}: hub_bore_mm_x100 ${v.hub_bore_mm_x100 ?? "null"} -> ${newX100}`
      )
      updated++
    } catch (e: any) {
      if (e instanceof QuotaOutageError) {
        logger.error("[backfill-garage-bore] wheel-size daily quota exhausted; stopping (re-run later to resume)")
        break
      }
      logger.error(`[backfill-garage-bore] ${label}: fitment lookup failed: ${e?.message ?? e}`)
      failed++
    }
  }

  logger.info("")
  logger.info(
    `[backfill-garage-bore] Done. updated=${updated} unchanged=${unchanged} skipped=${skipped} failed=${failed} total=${vehicles.length}`
  )
  logger.info("=====================================")
}
