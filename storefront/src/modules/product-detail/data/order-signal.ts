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

import { SHIP_LEAD_TIME, SPECIAL_ORDER_LEAD_TIME } from "./pdp-config"

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
 * Special order takes priority over availability: a real SO fulfillment
 * still carries the vendor's extended lead time regardless of what the
 * on-hand quantity happens to read, so the warning renders even for an
 * `out_of_stock` SO leaf (the buy button itself is disabled by the existing,
 * unrelated `canPurchasePrice` gate — this only decides what the CTA's
 * lead-time copy says).
 *
 * `low_stock` is treated the same as `in_stock` — it is still a buyable,
 * ships-soon variant, just a low count; only `out_of_stock` (and non-SO) has
 * no lead time left to promise.
 */
export function leadTimeLine({
  availability,
  isSpecialOrder,
}: {
  availability: LeadTimeAvailability
  isSpecialOrder: boolean
}): string | null {
  if (isSpecialOrder) return SPECIAL_ORDER_LEAD_TIME
  if (availability === "out_of_stock") return null
  return SHIP_LEAD_TIME
}
