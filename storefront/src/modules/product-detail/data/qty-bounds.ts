/**
 * Pure quantity-bounds helpers for the PDP purchase panels (WB-090 P2/P18).
 *
 * The qty stepper used to be inventory-blind — capped at a flat 99 and
 * defaulted to DEFAULT_WHEEL_QTY regardless of how many units actually
 * exist on the resolved variant/size — so adding e.g. 4 wheels when only
 * 1-3 are in stock failed at "Add to cart" with a generic "try again in a
 * moment" toast instead of being prevented (and explained) up front.
 *
 * Both the wheel and tire purchase panels share this logic verbatim — the
 * available quantity always resolves to a single leaf (a Medusa variant),
 * never an aggregate across siblings.
 */

/**
 * The stepper's effective max: never more than 99 (the pre-existing flat
 * ceiling), and never more than the variant's real on-hand quantity.
 *
 * `available` is 0 (genuinely out of stock) or `undefined` (unresolved
 * variant / data not yet loaded) in cases where the qty value is moot
 * anyway — Add to cart is already disabled by the availability check — so
 * both fall back to the pre-existing flat 99 cap rather than collapsing
 * the stepper to a useless 1.
 */
export function stepperCap(available: number | undefined): number {
  return typeof available === "number" && available > 0
    ? Math.min(99, available)
    : 99
}

/** Clamp a proposed quantity to [1, cap] — never below 1 even when cap is 0. */
export function clampQty(qty: number, cap: number): number {
  return Math.max(1, Math.min(cap, qty))
}
