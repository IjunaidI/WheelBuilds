/**
 * Format a Medusa money amount as a USD display string.
 *
 * Medusa v2 money is MAJOR units (dollars) end-to-end in the catalog/cart/
 * checkout/order-emails path (see the "Price-unit convention" note in
 * CLAUDE.md) — unlike the Meilisearch index, which stores integer cents.
 * Do NOT divide by 100 here.
 *
 * `formatUsd(1479.96)` -> `"$1,479.96"`; `formatUsd(0)` -> `"$0.00"`.
 *
 * NOTE: `currency: 'USD'` is hardcoded and ignores `order.currency_code`.
 * That's correct today (single-currency store) but will silently mislabel
 * amounts if a non-USD region is ever added — this must become a parameter
 * derived from the order's currency at that point.
 */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}
