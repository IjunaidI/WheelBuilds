import {
  productFitTier,
  type FitVehicle,
} from "@lib/fitment/product-has-fitting-variant"

/**
 * One cart/order line item's slice of what `productFitTier` needs — mirrors
 * the component-facing `FitmentCardItem` shape so both can share this pure
 * aggregation without either importing the other.
 */
export type FitSummaryItem = {
  variant?: { metadata?: Record<string, unknown> | null } | null
}

export type OrderFitSummary = "all" | "partial" | "none"

/**
 * Aggregates per-line fitment tiers into a single order-level verdict.
 *
 * - `"all"`     — EVERY line's best-fitting variant reaches "fits". Safe to
 *   make the CHECKED/GUARANTEED claim.
 * - `"partial"` — at least one line fits or check-fits, but not every line
 *   does — a neutral/partial state, no guarantee claim.
 * - `"none"`    — no vehicle, no items, or nothing on the order fits or
 *   check-fits at all (render nothing).
 *
 * C10: the card used to claim "Confirmed"/"Guaranteed" whenever ANY line fit
 * (`.some()`) — one fitting line let three non-fitting lines ride along
 * under a blanket guarantee. This requires EVERY line to individually reach
 * "fits" before making that claim.
 */
export function orderFitSummary(
  items: FitSummaryItem[] | undefined,
  vehicle: FitVehicle | null | undefined
): OrderFitSummary {
  if (!vehicle || !items?.length) return "none"

  let allFit = true
  let anyNonNo = false
  for (const item of items) {
    const tier = productFitTier([{ metadata: item.variant?.metadata }], vehicle)
    if (tier !== "fits") allFit = false
    if (tier !== "no") anyNonNo = true
  }

  if (allFit) return "all"
  return anyNonNo ? "partial" : "none"
}
