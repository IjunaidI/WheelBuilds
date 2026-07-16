/**
 * Special-order signal (WB-098 Task 4) — a plain (non-`"use server"`)
 * module, same reasoning as `backspacing.ts`/`set-price.ts`: these are
 * synchronous pure functions, and every export of a `"use server"` file
 * must be async.
 *
 * `vendor_inv_order_type` (`"ST" | "N2" | "SO"`) is written to EVERY
 * variant's metadata by the backend (`build-metadata.ts:52`) and already
 * reaches the storefront — sibling keys like `load_rating_lb` are read from
 * the same blob in `group-sizes.ts` / `tire-size-options.ts`. `"SO"`
 * (special order) is the only value worth flagging; `"ST"`/`"N2"` (and
 * anything else, including the key being absent) render exactly as before.
 */

import {
  SHIP_LEAD_TIME,
  SPECIAL_ORDER_LEAD_TIME,
  SPECIAL_ORDER_UNAVAILABLE,
} from "./pdp-config"

export type LeadTimeAvailability = "in_stock" | "low_stock" | "out_of_stock"

/**
 * True only for the literal vendor code `"SO"` — an exact match, no
 * case-folding (the vendor feed's own codes are uppercase). Everything else
 * (`"ST"`, `"N2"`, `undefined`, `null`, or any other unexpected metadata
 * value) is normal, non-special-order stock. Takes `unknown` so callers can
 * pass a raw `metadata.vendor_inv_order_type` value straight through without
 * an intermediate cast.
 */
export function isSpecialOrder(invOrderType: unknown): boolean {
  return invOrderType === "SO"
}

/**
 * The lead-time line for the purchase-panel CTA area — out of the
 * hover-only tooltip (WB-098 Task 4) so it's visible on touch too.
 *
 * Three distinct outcomes, in priority order:
 *
 * 1. **`isSpecialOrder && out_of_stock`** — WB-098 Task 4 fix-wave (Important
 *    review finding). Special-order stock in this vendor feed is essentially
 *    ALWAYS `qty: 0` (special-order stock is never counted on-hand), so this
 *    is the common real-world SO case, not an edge case. In this state
 *    `canPurchasePrice` disables Add to cart — so the old behavior (falling
 *    into the branch below and returning `SPECIAL_ORDER_LEAD_TIME`, "…
 *    extended lead time") read as "you can still order this, it'll just take
 *    longer" sitting right below a disabled button: a false promise. This
 *    branch must be checked BEFORE the general SO branch, or that branch
 *    would swallow it. Returns `SPECIAL_ORDER_UNAVAILABLE` — still names it
 *    as special-order (honest, explains WHY it's out of stock) but does not
 *    imply a self-serve, actionable lead time.
 * 2. **`isSpecialOrder` and buyable (`in_stock`/`low_stock`)** — a real SO
 *    fulfillment still carries the vendor's extended lead time regardless of
 *    the on-hand count; the shopper CAN act (the button is enabled), so the
 *    lead-time promise is honest here. Returns `SPECIAL_ORDER_LEAD_TIME`.
 * 3. **`out_of_stock`, not SO** — nothing to promise. Returns `null`.
 * 4. **Everything else** (`in_stock`/`low_stock`, not SO) — the normal ships
 *    copy. `low_stock` is treated the same as `in_stock` — still a buyable,
 *    ships-soon variant, just a low count. Returns `SHIP_LEAD_TIME`.
 */
export function leadTimeLine({
  availability,
  isSpecialOrder,
}: {
  availability: LeadTimeAvailability
  isSpecialOrder: boolean
}): string | null {
  if (isSpecialOrder && availability === "out_of_stock") {
    return SPECIAL_ORDER_UNAVAILABLE
  }
  if (isSpecialOrder) return SPECIAL_ORDER_LEAD_TIME
  if (availability === "out_of_stock") return null
  return SHIP_LEAD_TIME
}
