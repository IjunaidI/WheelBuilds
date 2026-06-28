import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_STATE_TABLES, truncateVendorState } from "../modules/vendor-sync/utils/truncate-state"

/**
 * Truncate the vendor-sync STATE tables (NOT Medusa products).
 *
 * Both this script and vendor-sync-dev-wipe.ts delegate to the same
 * truncateVendorState helper, which issues a single TRUNCATE per table —
 * instant regardless of row count, and the correct tool for a full state reset
 * before a re-import (e.g. the WB-051 six-axis migration). This script's role
 * is a state-only reset: it prints per-table row counts before truncating so
 * the operator can confirm what will be erased.
 *
 * It does NOT touch Medusa products. Purge those first via the
 * /admin/vendor-sync/purge-products route (or dev-wipe --purge-products).
 *
 * Guarded by --confirm-host=<host> matching DATABASE_URL, same as dev-wipe, so
 * a copy-paste cannot truncate the wrong database.
 *
 * Usage:
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-truncate-state.ts
 *      (prints the target host + row counts; refuses to act)
 *   pnpm exec medusa exec ./src/scripts/vendor-sync-truncate-state.ts -- --confirm-host=<host>
 *      (truncates all four vendor-sync state tables)
 */

const TABLES = VENDOR_STATE_TABLES

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

export default async function vendorSyncTruncateState({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error("[truncate] DATABASE_URL is not a valid URL; refusing to act.")
    return
  }

  logger.info("")
  logger.info("Vendor Sync Truncate State")
  logger.info("==========================")
  logger.info(`DATABASE_URL points at: ${parsed.display}`)
  logger.info("")
  logger.info("This will TRUNCATE (delete ALL rows from) these tables:")
  for (const t of TABLES) {
    let count = "?"
    try {
      const rows = await knex(t).count("* as count")
      count = String(rows?.[0]?.count ?? "?")
    } catch (e: any) {
      count = `(count failed: ${e?.message ?? e})`
    }
    logger.info(`  ${t.padEnd(24)} ${count}`)
  }
  logger.info("")
  logger.info("Medusa products are NOT touched. Purge those separately first.")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  pnpm exec medusa exec ./src/scripts/vendor-sync-truncate-state.ts -- --confirm-host=${parsed.host}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flag)")
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[truncate] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  // Single statement; truncating all four together resolves any inter-table FKs.
  await truncateVendorState(knex)

  logger.info("[truncate] Done. All vendor-sync state cleared.")
  logger.info("[truncate] The next vendor-sync run will treat every row as new.")
  logger.info("==========================")
}
