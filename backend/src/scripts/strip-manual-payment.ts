import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * WB-071 F-A: when Stripe is configured, strip `pp_system_default` (Manual
 * Payment) out of every region's payment_providers so it can never be
 * offered at checkout. Defense-in-depth — the storefront already filters
 * `pp_system_default` out of the payment-method list (WB-071 F-A,
 * storefront), and region creation (bootstrap.ts / seed.ts) no longer wires
 * it in when Stripe is configured. This script is for regions that already
 * exist with the old unconditional `["pp_system_default"]` wiring.
 *
 * Mechanism (confirmed against the installed @medusajs/core-flows source,
 * `region/workflows/update-regions.ts` + `region/steps/set-regions-payment-providers.ts`):
 * `updateRegionsWorkflow`'s `update.payment_providers` is treated as the
 * DESIRED FULL SET of providers for the region. The step diffs it against
 * the region's existing Region<->PaymentProvider links (a remote-link
 * association, not a plain column on the region row) and dismisses any
 * link not in the desired list while creating any missing one. Passing
 * `["pp_stripe_stripe"]` therefore both removes the `pp_system_default`
 * link and idempotently ensures the Stripe link exists — running this
 * script twice in a row is a no-op the second time.
 *
 * Refuses to run without `-- --confirm-host=<DATABASE_URL host>` so a
 * copy-paste from history cannot run this against the wrong DB (mirrors
 * the guard in `vendor-sync-dev-wipe.ts`). Never run this against the
 * production DB host without deliberately intending to.
 *
 * Usage:
 *
 *   pnpm exec medusa exec ./src/scripts/strip-manual-payment.ts
 *      (prints the target host + instructions; refuses to act)
 *
 *   pnpm exec medusa exec ./src/scripts/strip-manual-payment.ts \
 *      -- --confirm-host=<the host printed above>
 *      (sets payment_providers -> ["pp_stripe_stripe"] on every region)
 */

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

export default async function stripManualPayment({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const host = parseDbHost(process.env.DATABASE_URL)
  if (!host) {
    logger.error(
      "[strip-manual-payment] DATABASE_URL is not a valid URL; refusing to run."
    )
    return
  }

  const stripeConfigured = !!(
    process.env.STRIPE_API_KEY && process.env.STRIPE_WEBHOOK_SECRET
  )
  if (!stripeConfigured) {
    logger.warn(
      "[strip-manual-payment] STRIPE_API_KEY/STRIPE_WEBHOOK_SECRET are not " +
        "both set — leaving pp_system_default in place (it would otherwise " +
        "be the only payment provider left). Nothing to do."
    )
    return
  }

  logger.info("")
  logger.info("Strip Manual Payment (WB-071 F-A)")
  logger.info("==================================")
  logger.info(`DATABASE_URL host: ${host}`)
  logger.info(
    'Stripe is configured. This will set every region\'s payment_providers'
  )
  logger.info(
    'to ["pp_stripe_stripe"], removing pp_system_default (Manual Payment)'
  )
  logger.info("wherever it is currently linked.")
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  pnpm exec medusa exec ./src/scripts/strip-manual-payment.ts -- --confirm-host=${host}`
    )
    logger.info(
      "(the `--` separator is required so medusa exec ignores the flag)"
    )
    logger.info("")
    return
  }

  if (confirmHost !== host) {
    logger.error(
      `[strip-manual-payment] --confirm-host=${confirmHost} does not match DATABASE_URL host (${host}). Aborting.`
    )
    return
  }

  const regionService = container.resolve(Modules.REGION)
  const regions = await regionService.listRegions({})

  if (!regions.length) {
    logger.info("[strip-manual-payment] No regions found. Nothing to do.")
    return
  }

  for (const region of regions) {
    logger.info(
      `[strip-manual-payment] Region ${region.id} (${region.name}): setting payment_providers -> ["pp_stripe_stripe"]`
    )
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: ["pp_stripe_stripe"] },
      },
    })
  }

  logger.info("[strip-manual-payment] Done.")
  logger.info("====================")
}
