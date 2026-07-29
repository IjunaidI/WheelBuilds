/**
 * The free-shipping threshold, in USD major units (WB-118 Q-05).
 *
 * ⚠️ LOCKSTEP TWIN: `FREE_SHIP_THRESHOLD_USD` in
 * `backend/src/scripts/update-shipping-prices.ts`, which is what actually
 * creates the $0 shipping price gated on `item_total >= N`. The two apps
 * install separately (no workspace tool), so this cannot be a shared import —
 * if you change one, change the other AND re-run that script against every
 * environment. The same twin pattern is used for `normalizeFinish` and
 * `canonicalBoltPatterns`; those carry a shared golden fixture, which would be
 * heavier than warranted for a single number.
 *
 * This exists because the "$199+" figure was written independently in five
 * places — the trust strip, two home merchandising entries, the shipping
 * policy page, and the PDP config — while the rule itself lived only in that
 * backend script. The script had never been run against production, so every
 * one of those surfaces was advertising a promise the cart did not honour: a
 * live $333 cart was still charged $10 shipping (verified 2026-07-29).
 *
 * Env override: `NEXT_PUBLIC_FREE_SHIP_USD`. The older, PDP-scoped
 * `NEXT_PUBLIC_PDP_FREE_SHIP_USD` is still honoured as a fallback so existing
 * deployments keep working — the value simply stopped being PDP-specific once
 * four other surfaces started reading it.
 */

const intEnv = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

export const FREE_SHIPPING_THRESHOLD_USD = intEnv(
  // Both branches must be literal `process.env.NEXT_PUBLIC_*` member
  // expressions — that is how Next.js inlines them at build time.
  process.env.NEXT_PUBLIC_FREE_SHIP_USD ??
    process.env.NEXT_PUBLIC_PDP_FREE_SHIP_USD,
  199
)

/**
 * The customer-facing label, e.g. `"Free shipping $199+"`. Never hard-code
 * this string — it is a promise the checkout has to keep.
 */
export function freeShippingLabel(): string {
  return `Free shipping $${FREE_SHIPPING_THRESHOLD_USD}+`
}
