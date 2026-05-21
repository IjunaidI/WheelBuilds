import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

/**
 * Dev-only wipe of vendor-sync state. Deletes every row in:
 *
 *   vendor_feed_run
 *   vendor_feed_staging
 *   vendor_stock_staging
 *   vendor_product_current
 *
 * for both wheelpros vendors. Does NOT touch Medusa products, variants,
 * inventory items, collections, categories, or stock locations -- the
 * brief is "wipe vendor-sync's view of the world so the next apply
 * treats every row as new", not "purge the catalog".
 *
 * Guarded by a --confirm-host=<host> flag whose value MUST match the
 * host parsed out of DATABASE_URL. The flag is intentionally awkward to
 * type so a copy-paste from history cannot run this against a
 * non-target DB.
 *
 * Usage:
 *
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts
 *      (prints the target host + instructions; refuses to act)
 *
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts \
 *      --confirm-host=<the host printed above>
 *      (actually wipes)
 */

const VENDORS = ["wheelpros-wheels", "wheelpros-tires"]

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
    // postgres://****@host:port/db
    return {
      display: `${u.protocol}//****@${host}${port}/${db}`,
      host,
    }
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

export default async function vendorSyncDevWipe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error(
      "[wipe] DATABASE_URL is not a valid URL; refusing to wipe."
    )
    return
  }

  logger.info("")
  logger.info("Vendor Sync Dev Wipe")
  logger.info("====================")
  logger.info(`DATABASE_URL points at: ${parsed.display}`)
  logger.info("")
  logger.info(
    "This will DELETE every row in vendor_feed_run, vendor_feed_staging,"
  )
  logger.info(
    "vendor_stock_staging, and vendor_product_current for vendors:"
  )
  logger.info(`  ${VENDORS.join(", ")}`)
  logger.info("")
  logger.info(
    "Medusa products, variants, collections, and stock locations are"
  )
  logger.info("NOT touched.")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(`  --confirm-host=${parsed.host}`)
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[wipe] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  let runIds: string[] = []
  let stagingIds: string[] = []
  let stockIds: string[] = []
  let currentIds: string[] = []

  for (const vendorCode of VENDORS) {
    const runs = await service.listVendorFeedRuns(
      { vendor_code: vendorCode },
      { select: ["id"], take: null }
    )
    runIds = runIds.concat(runs.map((r: any) => r.id))

    const staging = await service.listVendorFeedStagings(
      { vendor_code: vendorCode },
      { select: ["id"], take: null }
    )
    stagingIds = stagingIds.concat(staging.map((r: any) => r.id))

    const stock = await service.listVendorStockStagings(
      { vendor_code: vendorCode },
      { select: ["id"], take: null }
    )
    stockIds = stockIds.concat(stock.map((r: any) => r.id))

    const current = await service.listVendorProductCurrents(
      { vendor_code: vendorCode },
      { select: ["id"], take: null }
    )
    currentIds = currentIds.concat(current.map((r: any) => r.id))
  }

  logger.info(`[wipe] Found:`)
  logger.info(`  vendor_feed_run         ${runIds.length}`)
  logger.info(`  vendor_feed_staging     ${stagingIds.length}`)
  logger.info(`  vendor_stock_staging    ${stockIds.length}`)
  logger.info(`  vendor_product_current  ${currentIds.length}`)
  logger.info("")

  // Delete in dependency-safe order: staging tables first (they only
  // reference run_id), then current (no FK), then runs last.
  if (stagingIds.length > 0) {
    await service.deleteVendorFeedStagings(stagingIds)
  }
  if (stockIds.length > 0) {
    await service.deleteVendorStockStagings(stockIds)
  }
  if (currentIds.length > 0) {
    await service.deleteVendorProductCurrents(currentIds)
  }
  if (runIds.length > 0) {
    await service.deleteVendorFeedRuns(runIds)
  }

  logger.info("[wipe] Done.")
  logger.info(
    "[wipe] The next vendor-sync run will treat every row as new."
  )
  logger.info("====================")
}
