import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Add US (+ CA) country coverage to the live shipping service zone(s).
 *
 * The seed created a single fulfillment service zone covering only European
 * countries (gb/de/dk/se/fr/es/it). This is a US store (storefront at /us/, a
 * US/usd region), so a US cart matches NO shipping option and the checkout
 * "delivery" step has nothing to select. Editing seed.ts only fixes fresh DBs;
 * the already-seeded live region needs this one-off.
 *
 * Additive + idempotent: it only CREATES the missing us/ca country geo zones on
 * each existing service zone (via fulfillment.createGeoZones) — it never deletes
 * or rewrites existing zones, options, or prices. Safe to re-run.
 *
 * Guarded by --confirm-host=<host> matching DATABASE_URL, same as the wipe
 * scripts, so a copy-paste cannot mutate the wrong database. Without the flag it
 * prints current coverage and refuses to act.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/update-shipping-zones.ts
 *      (prints the target host + current geo-zone coverage; refuses to act)
 *   npx medusa exec ./src/scripts/update-shipping-zones.ts -- --confirm-host=<host>
 *      (adds the missing us/ca geo zones)
 */

const ADD_COUNTRIES = ["us", "ca"]

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

export default async function updateShippingZones({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any

  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed) {
    logger.error("[shipping-zones] DATABASE_URL is not a valid URL; refusing to act.")
    return
  }

  const sets = await fulfillment.listFulfillmentSets(
    {},
    { relations: ["service_zones", "service_zones.geo_zones"] }
  )

  logger.info("")
  logger.info("Update Shipping Zones")
  logger.info("=====================")
  logger.info(`DATABASE_URL points at: ${parsed.display}`)
  logger.info("")
  logger.info("Current service-zone country coverage:")

  const toCreate: { service_zone_id: string; country_code: string; type: "country" }[] = []

  for (const set of sets ?? []) {
    for (const zone of set.service_zones ?? []) {
      const countries = (zone.geo_zones ?? [])
        .filter((g: any) => g.type === "country")
        .map((g: any) => g.country_code)
      logger.info(`  set "${set.name}" / zone "${zone.name}": [${countries.join(", ") || "—"}]`)

      const existing = new Set(countries)
      for (const cc of ADD_COUNTRIES) {
        if (!existing.has(cc)) {
          toCreate.push({ service_zone_id: zone.id, country_code: cc, type: "country" })
        }
      }
    }
  }

  logger.info("")
  if (toCreate.length === 0) {
    logger.info("[shipping-zones] All service zones already cover us/ca. Nothing to do.")
    logger.info("=====================")
    return
  }

  logger.info(`Will ADD ${toCreate.length} country geo zone(s):`)
  for (const z of toCreate) {
    logger.info(`  + ${z.country_code} → service_zone ${z.service_zone_id}`)
  }
  logger.info("(existing zones, options, and prices are NOT modified)")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  npx medusa exec ./src/scripts/update-shipping-zones.ts -- --confirm-host=${parsed.host}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flag)")
    logger.info("")
    return
  }

  if (confirmHost !== parsed.host) {
    logger.error(
      `[shipping-zones] --confirm-host=${confirmHost} does not match DATABASE_URL host (${parsed.host}). Aborting.`
    )
    return
  }

  await fulfillment.createGeoZones(toCreate)

  logger.info(`[shipping-zones] Done. Added ${toCreate.length} geo zone(s).`)
  logger.info("[shipping-zones] US/CA carts now match the existing Standard/Express options.")
  logger.info("=====================")
}
