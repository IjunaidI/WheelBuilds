import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createTaxRegionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Create the missing US tax region (WB-080 D3 — manual tax setup).
 *
 * The seed created tax regions for 7 EU countries only, so US orders compute
 * $0 tax. This one-off creates the US country tax region (system provider, no
 * default rate). Rates are then entered in the admin — Settings → Tax Regions
 * → United States → add a province (state) region + rate for each nexus state.
 * Which states have nexus is the merchant's call (see the go-live runbook).
 *
 * Idempotent: skips creation when a US tax region already exists.
 *
 * Guarded by --confirm-host=<host> matching DATABASE_URL, same as the other
 * one-off scripts, so a copy-paste cannot mutate the wrong database. Without
 * the flag it prints the current tax-region coverage and refuses to act.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/create-us-tax-region.ts
 *      (prints the target host + current tax regions; refuses to act)
 *   npx medusa exec ./src/scripts/create-us-tax-region.ts -- --confirm-host=<host>
 *      (creates the US tax region)
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

export default async function createUsTaxRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tax = container.resolve(Modules.TAX) as any

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error("[us-tax-region] DATABASE_URL is not a valid URL; refusing to act.")
    return
  }

  const existing = await tax.listTaxRegions({})
  const countries = (existing ?? [])
    .filter((r: any) => !r.parent_id)
    .map((r: any) => r.country_code)

  logger.info("")
  logger.info("Create US Tax Region")
  logger.info("====================")
  logger.info(`DATABASE_URL points at: ${parsed.display}`)
  logger.info("")
  logger.info(`Current country tax regions: [${countries.join(", ") || "—"}]`)
  logger.info("")

  if (countries.includes("us")) {
    logger.info("[us-tax-region] A US tax region already exists. Nothing to do.")
    logger.info("[us-tax-region] Enter/verify state rates in admin → Settings → Tax Regions → United States.")
    logger.info("====================")
    return
  }

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("Will CREATE the US country tax region (system provider, no default rate).")
    logger.info("To proceed, re-run with:")
    logger.info(
      `  npx medusa exec ./src/scripts/create-us-tax-region.ts -- --confirm-host=${parsed.host}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flag)")
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[us-tax-region] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "us", provider_id: "tp_system" }],
  })

  logger.info("[us-tax-region] Done. US tax region created (no default rate — 0% until rates are entered).")
  logger.info("[us-tax-region] NEXT: admin → Settings → Tax Regions → United States → add a province")
  logger.info("[us-tax-region] region + rate per nexus state (merchant decision — see the go-live runbook).")
  logger.info("====================")
}
