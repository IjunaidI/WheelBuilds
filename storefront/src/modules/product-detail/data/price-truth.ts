/**
 * Price-truth helpers for the PDP purchase panels (WB-090 P12).
 *
 * The headline price must reflect the SELECTED variant's OWN price — never a
 * sibling's. Both surfaces used to fall back to a size/product-level "from"
 * price when the selected leaf had no price of its own —
 * `currentOffset?.priceCents ?? selectedSize.priceCentsOverride ??
 * product.priceCents` on the wheel hero, `selectedSize?.priceCents ??
 * product.priceCents` on the tire hero — silently showing a DIFFERENT
 * (usually lower) price than what this exact variant would actually charge,
 * and letting a genuinely price-less variant render a misleading "$0.00"
 * behind an enabled buy button.
 */

/**
 * The selected variant's own price in cents, or `null` when missing or
 * non-positive — Medusa has no live price for this exact variant right now,
 * so the panel renders "Price unavailable" instead of a fabricated fallback.
 * Deliberately takes ONLY the variant's own price as input — callers must
 * not pass a sibling/product-level price through this function, or the
 * "no sibling fallback" guarantee is defeated at the call site.
 */
export function headlinePriceCents(
  ownPriceCents: number | null | undefined
): number | null {
  return typeof ownPriceCents === "number" && ownPriceCents > 0
    ? ownPriceCents
    : null
}

/**
 * A variant is purchasable only when it has resolved to a real, in-stock
 * leaf AND carries a real (>0) price. `hasResolvedVariant` is the caller's
 * existing resolution/availability gate (e.g. `!!selectedVariant &&
 * availability !== "out_of_stock"`); this ANDs in the price gate so a
 * $0/price-less variant can never be added to cart even though it resolved
 * and shows as "in stock".
 */
export function canPurchasePrice(
  hasResolvedVariant: boolean,
  unitPriceCents: number | null
): boolean {
  return hasResolvedVariant && unitPriceCents !== null && unitPriceCents > 0
}
