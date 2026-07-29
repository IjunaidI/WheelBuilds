import { FREE_SHIPPING_THRESHOLD_USD } from "@lib/util/shipping-threshold"

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

/**
 * Free-shipping order threshold shown in the trust strip (USD).
 *
 * WB-118 Q-05: this used to own its own copy of the number. It is now a
 * re-export of the shared `FREE_SHIPPING_THRESHOLD_USD`, which the checkout
 * trust strip, home merchandising and the shipping policy page all read too —
 * the figure stopped being PDP-specific once five surfaces advertised it. The
 * legacy `NEXT_PUBLIC_PDP_FREE_SHIP_USD` override still works (see that
 * module); this alias is kept so existing importers don't break.
 */
export const FREE_SHIP_THRESHOLD_USD = FREE_SHIPPING_THRESHOLD_USD

/** Lead-time copy on in-stock sizes. */
export const SHIP_LEAD_TIME = process.env.NEXT_PUBLIC_PDP_SHIP_LEAD_TIME ?? "ships 2–3 days"

/**
 * CTA-area lead-time copy when the selected variant/size is vendor
 * special-order (WB-098 Task 4 — `vendor_inv_order_type === "SO"`). Rendered
 * instead of `SHIP_LEAD_TIME` because a special-order item takes a
 * materially longer, vendor-driven lead time regardless of on-hand
 * quantity — see `order-signal.ts`'s `leadTimeLine`.
 */
export const SPECIAL_ORDER_LEAD_TIME =
  process.env.NEXT_PUBLIC_PDP_SPECIAL_ORDER_LEAD_TIME ??
  "Special order — extended lead time"

/**
 * CTA-area copy when the selected variant/size is BOTH vendor special-order
 * AND out of stock (WB-098 Task 4 fix-wave — Important review finding).
 * Special-order stock in this vendor feed is essentially always `qty: 0`
 * (special-order stock is never counted on-hand), so this combination is the
 * COMMON real-world SO case, not an edge case — see `order-signal.ts`'s
 * `leadTimeLine`. In that state `canPurchasePrice` disables Add to cart, so
 * `SPECIAL_ORDER_LEAD_TIME`'s "extended lead time" wording would falsely
 * promise a self-serve order the shopper has no button to act on. This copy
 * stays honest (still names it as special-order, so the shopper understands
 * WHY it's out of stock) without implying orderability through a disabled
 * control.
 */
export const SPECIAL_ORDER_UNAVAILABLE =
  process.env.NEXT_PUBLIC_PDP_SPECIAL_ORDER_UNAVAILABLE ??
  "Special order — contact us to order"

/**
 * Trailing noun on the set-total row under the per-unit price (WB-098 Task
 * 2), e.g. "$369.99 × 4 = $1,479.96 per set". Wheels and tires both sell in
 * sets of 4 today so one shared const covers both panels; split into
 * per-panel consts if the wording ever needs to diverge (e.g. "per set of 4
 * tires").
 */
export const SET_PRICE_SUFFIX = process.env.NEXT_PUBLIC_PDP_SET_PRICE_SUFFIX ?? "per set"

/**
 * Static legend explaining the tire hero's "Load index 118S" stat (WB-098
 * Task 4) — generic copy, NOT derived from the selected size's actual
 * numbers (the "118"/"S" here are illustrative, matching the stat's own
 * example values, not a live readout).
 */
export const TIRE_LOAD_SPEED_LEGEND =
  process.env.NEXT_PUBLIC_PDP_TIRE_LOAD_SPEED_LEGEND ??
  "118 = load index (max load), S = speed rating (max speed)"

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
