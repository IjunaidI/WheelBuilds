/**
 * PDP presentation config (WB-029). De-hardcodes values that were literals in
 * the PDP components. Each numeric reads an optional NEXT_PUBLIC_PDP_* env
 * override, else the default. These are display defaults — NOT authoritative
 * product data (construction/origin/warranty come from product metadata; see
 * get-product.ts).
 */

const intEnv = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback
}

/** Default quantity selected on the PDP — wheels sell in sets of 4. */
export const DEFAULT_WHEEL_QTY = intEnv(process.env.NEXT_PUBLIC_PDP_DEFAULT_QTY, 4)

/** Default quantity selected on a tire PDP (a set of 4; env-overridable). */
export const DEFAULT_TIRE_QTY = intEnv(process.env.NEXT_PUBLIC_PDP_TIRE_DEFAULT_QTY, 4)

/** On-hand count at or below which a size shows "low stock". */
export const LOW_STOCK_THRESHOLD = intEnv(process.env.NEXT_PUBLIC_PDP_LOW_STOCK_THRESHOLD, 4)

/** Free-shipping order threshold shown in the trust strip (USD). */
export const FREE_SHIP_THRESHOLD_USD = intEnv(process.env.NEXT_PUBLIC_PDP_FREE_SHIP_USD, 199)

/** Lead-time copy on in-stock sizes. */
export const SHIP_LEAD_TIME = process.env.NEXT_PUBLIC_PDP_SHIP_LEAD_TIME ?? "ships 2–3 days"

/**
 * Trust-strip cells in the purchase panel. `href` is optional — only the
 * "Fitment guarantee" cell links out today (to the real fitment-returns
 * section on /returns); the other cells render as plain text.
 */
export const TRUST_STRIP: {
  icon: "shipping" | "shield" | "return"
  heading: string
  sub: string
  href?: string
}[] = [
  { icon: "shipping", heading: "Free shipping", sub: `Orders $${FREE_SHIP_THRESHOLD_USD}+` },
  {
    icon: "shield",
    heading: "Fitment guarantee",
    // WB-091 P6: "Or money back" overstated an unconditional refund the
    // returns policy doesn't actually promise — the real policy (see
    // modules/policies/content.ts "Fitment-related returns") is conditional
    // (unmounted/unused, contact us before ordering when in doubt).
    sub: "See our fitment returns policy",
    href: "/returns#fitment",
  },
  { icon: "return", heading: "30-day returns", sub: "Unmounted" },
]
