import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * WB-071 F-H: adds (or updates) a $0 USD price on the live "Standard
 * Shipping" / "Express Shipping" options, gated on cart item subtotal
 * >= $199 — so the "Free shipping $199+" copy on home/PDP/checkout is
 * actually true instead of aspirational. Companion to the `seed.ts`
 * change that gives freshly-seeded DBs the same rule from day one; this
 * script is for a catalog that's already live and was seeded before this
 * rule existed.
 *
 * Threshold is $199 in MAJOR units (dollars), NOT cents. Confirmed
 * against the installed @medusajs/dashboard 2.13.6 source: the admin's
 * own "conditional shipping price" feature (the exact feature we're
 * driving here programmatically) hardcodes the attribute name
 * `ITEM_TOTAL_ATTRIBUTE = "item_total"` (see
 * .../locations/common/constants.ts) and renders that rule's gte/lte
 * value through a `CurrencyInput` with `decimalScale: currency.decimal_digits`
 * — the SAME formatting as the flat price `amount` field (which this repo's
 * own seed.ts already writes as `10` for $10, not `1000`). So `value: 199`
 * means $199, matching this project's established "dollars in Medusa"
 * price convention (see CLAUDE.md).
 *
 * Confirmed that `item_total` is actually populated in the pricing
 * context at checkout: @medusajs/core-flows
 * `cart/workflows/list-shipping-options-for-cart-with-pricing.js` fetches
 * the cart with fields including `item_total`, then for flat-rate options
 * queries `calculated_price: { context: cart }` — so `context.item_total`
 * is present when Medusa selects the best-matching price, and the pricing
 * repository (`@medusajs/pricing` `repositories/pricing.js`) orders
 * matching prices by `rules_count DESC`, so our ruled $0 price always
 * outranks the ruleless $10 default once it matches.
 *
 * Mechanism — deliberately `pricingService.addPrices()`, NOT
 * `updateShippingOptionsWorkflow` / `pricingService.updatePriceSets()`:
 * reading `@medusajs/pricing` `services/pricing-module.js` shows
 * `updatePriceSets_` treats the incoming `prices` array as the FULL
 * desired set for the price_set and DELETES any existing price omitted
 * from it (including the region-scoped price's hidden `region_id` rule,
 * which isn't visible as a plain field when re-fetched — round-tripping
 * it losslessly would mean reconstructing rules we can't see). `addPrices`
 * has no such blast radius: it hashes each incoming price on
 * `currency_code + price_set_id + price_rules(attribute=value)` (NOT
 * amount) against the price_set's existing rows and updates in place on a
 * hash match instead of creating a duplicate — so re-running this script
 * is a no-op (or a clean amount update if FREE_SHIP_THRESHOLD_USD ever
 * changes), and it never touches the flat $10 prices or the region price.
 *
 * Guarded by --confirm-host=<DATABASE_URL host>, mirroring
 * vendor-sync-dev-wipe.ts / strip-manual-payment.ts. Do NOT run this
 * against a live DB without deliberately intending to.
 *
 * Usage:
 *
 *   pnpm exec medusa exec ./src/scripts/update-shipping-prices.ts
 *      (prints the target host + instructions; refuses to act)
 *
 *   pnpm exec medusa exec ./src/scripts/update-shipping-prices.ts \
 *      -- --confirm-host=<the host printed above>
 *      (adds/updates the free-over-$199 USD price on Standard + Express)
 */

const FREE_SHIP_THRESHOLD_USD = 199
const TARGET_OPTION_NAMES = ["Standard Shipping", "Express Shipping"]

function parseDbHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
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

export default async function updateShippingPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const host = parseDbHost(process.env.DATABASE_URL)
  if (!host) {
    logger.error(
      "[update-shipping-prices] DATABASE_URL is not a valid URL; refusing to run."
    )
    return
  }

  logger.info("")
  logger.info("Update Shipping Prices — Free over $199 (WB-071 F-H)")
  logger.info("=====================================================")
  logger.info(`DATABASE_URL host: ${host}`)
  logger.info(
    `This will add/update a $0 USD price on: ${TARGET_OPTION_NAMES.join(", ")}`
  )
  logger.info(
    `gated on item_total >= ${FREE_SHIP_THRESHOLD_USD} (USD, major units, i.e. dollars).`
  )
  logger.info(
    "Existing flat $10 prices (usd/eur/region) are left untouched — this"
  )
  logger.info("only ever adds/updates the one ruled price per option.")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  pnpm exec medusa exec ./src/scripts/update-shipping-prices.ts -- --confirm-host=${host}`
    )
    logger.info(
      "(the `--` separator is required so medusa exec ignores the flag)"
    )
    logger.info("")
    return
  }

  if (confirmHost !== host) {
    logger.error(
      `[update-shipping-prices] --confirm-host=${confirmHost} does not match DATABASE_URL host (${host}). Aborting.`
    )
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingService = container.resolve(Modules.PRICING)

  const { data: options } = await query.graph({
    entity: "shipping_options",
    fields: ["id", "name", "prices.*"],
    filters: { name: TARGET_OPTION_NAMES },
  })

  if (!options.length) {
    logger.warn(
      `[update-shipping-prices] No shipping options found matching: ${TARGET_OPTION_NAMES.join(", ")}. Nothing to do.`
    )
    return
  }

  for (const option of options as any[]) {
    const priceSetId = option.prices?.[0]?.price_set_id as string | undefined
    if (!priceSetId) {
      logger.warn(
        `[update-shipping-prices] Shipping option "${option.name}" (${option.id}) has no prices/price_set — skipping.`
      )
      continue
    }

    logger.info(
      `[update-shipping-prices] "${option.name}" (${option.id}): addPrices on price_set ${priceSetId}`
    )

    await pricingService.addPrices({
      priceSetId,
      prices: [
        {
          currency_code: "usd",
          amount: 0,
          rules: {
            item_total: [
              { operator: "gte", value: FREE_SHIP_THRESHOLD_USD },
            ],
          },
        },
      ],
    })
  }

  logger.info("[update-shipping-prices] Done.")
  logger.info("=====================================================")
}
