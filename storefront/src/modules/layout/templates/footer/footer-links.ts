export type FooterLink = { label: string; href: string }

/**
 * Top-N brands by product count, as footer links. Pure so it can be unit
 * tested without pulling in the Meilisearch adapter (WB-085 N1/N8) — the
 * caller passes `facets.brands` straight from `getHomeCatalog()`.
 */
export function footerBrandLinks(
  brands: Record<string, number>,
  n = 5
): FooterLink[] {
  return Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label]) => ({
      label,
      href: `/store?brands=${encodeURIComponent(label)}`,
    }))
}
