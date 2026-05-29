import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

/**
 * Dev-only reset of vendor-sync state.
 *
 * Default behavior:
 *   Deletes every row in vendor_feed_run, vendor_feed_staging,
 *   vendor_stock_staging, vendor_product_current for both wheelpros
 *   vendors. Does NOT touch Medusa products.
 *
 * With --purge-products:
 *   Also deletes every Medusa product whose metadata.vendor_code is one
 *   of the wheelpros vendors. Use this when you need a fully clean
 *   catalog before re-applying under a new grouping rule (the 41
 *   pre-grouping products in dev are the motivating case).
 *
 * Guarded by --confirm-host=<host> whose value MUST match the host
 * parsed out of DATABASE_URL. The flag is intentionally awkward to
 * type so a copy-paste from history cannot run this against a
 * non-target DB.
 *
 * Usage:
 *
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts
 *      (prints the target host + instructions; refuses to act)
 *
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts \
 *      -- --confirm-host=<the host printed above>
 *      (wipes vendor-sync tables; leaves Medusa products alone)
 *
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts \
 *      -- --confirm-host=<host> --purge-products
 *      (also deletes every Medusa product whose metadata.vendor_code
 *       names one of our vendors)
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

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

export default async function vendorSyncDevWipe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any
  const productService = container.resolve(Modules.PRODUCT)

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error(
      "[wipe] DATABASE_URL is not a valid URL; refusing to wipe."
    )
    return
  }

  const purgeProducts = hasFlag("--purge-products")

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
  if (purgeProducts) {
    logger.info(
      "WITH --purge-products: also deletes every Medusa product whose"
    )
    logger.info(
      "metadata.vendor_code names one of the vendors above. Inventory"
    )
    logger.info(
      "items, prices, and price-list rules linked to those variants are"
    )
    logger.info("removed by the workflow's hooks.")
  } else {
    logger.info(
      "Medusa products, variants, collections, and stock locations are"
    )
    logger.info("NOT touched. Pass --purge-products to also delete them.")
  }
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  pnpm exec medusa exec ./src/scripts/vendor-sync-dev-wipe.ts -- --confirm-host=${parsed.host}${purgeProducts ? " --purge-products" : ""}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flag)")
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[wipe] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  // Find the vendor-sync-owned Medusa products first so we can also
  // delete them later if --purge-products is set. metadata.vendor_code
  // is the marker every apply path writes; listProducts fetches the
  // whole product table once in dev (~50 rows) and we filter in JS.
  let productIdsToDelete: string[] = []
  if (purgeProducts) {
    const allProducts = await productService.listProducts(
      {},
      { select: ["id", "metadata"], take: null }
    )
    const vendorCodeSet = new Set(VENDORS)
    for (const p of allProducts) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      const vendorCode = meta.vendor_code as string | undefined
      if (vendorCode && vendorCodeSet.has(vendorCode)) {
        productIdsToDelete.push(p.id)
      }
    }
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
  if (purgeProducts) {
    logger.info(`  product (Medusa)        ${productIdsToDelete.length}`)
  }
  logger.info("")

  // Delete Medusa products first (so any references to vendor_product_current
  // are gone before we drop those rows). The workflow handles variant +
  // inventory_item cleanup via its hooks.
  if (purgeProducts && productIdsToDelete.length > 0) {
    // Delete in chunks to keep the workflow input bounded.
    const CHUNK = 50
    for (let i = 0; i < productIdsToDelete.length; i += CHUNK) {
      const chunk = productIdsToDelete.slice(i, i + CHUNK)
      logger.info(
        `[wipe] Deleting Medusa products ${i + 1}..${i + chunk.length} of ${productIdsToDelete.length}...`
      )
      await deleteProductsWorkflow(container).run({
        input: { ids: chunk },
      })
    }
  }

  // Then the vendor-sync tables. Staging first, current next, runs last.
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
