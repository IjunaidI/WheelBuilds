/**
 * Pure gate for the OUT-OF-STOCK card badge (WB-100 Task 4).
 *
 * `DiscoveryProduct.inStock` (and its tire twin) has THREE states, not two:
 *   - `true`      — Meilisearch's `in_stock` field is exactly true.
 *   - `false`     — Meilisearch's `in_stock` field is exactly false.
 *   - `undefined` — UNKNOWN. `DiscoveryProductCard` is reused by the PDP
 *     "Similar wheels" row (`toRelatedProduct`) and the home NEW ARRIVALS
 *     rail (`toFeatured`), both built straight from the Medusa Store API —
 *     neither mapper sets `inStock` at all, so it's `undefined` there, not a
 *     stand-in for "out of stock".
 *
 * The badge must render ONLY on the confirmed-false case. A `!inStock` or
 * `?? false`-style falsy/nullish check would treat `undefined` as "out of
 * stock" too, which would badge EVERY related/featured product wrongly.
 * `=== false` is the only check that keeps `undefined` and `true` both
 * silent. This function exists to pin that rule so a future refactor can't
 * quietly widen it back to a falsy check.
 */
export function showOutOfStock(inStock: boolean | undefined): boolean {
  return inStock === false
}
