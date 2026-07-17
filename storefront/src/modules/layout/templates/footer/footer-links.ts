import { brandHref, type BrandHandleMap } from "@modules/brands/data/brand-tiles"

export type FooterLink = { label: string; href: string }

/**
 * Top-N brands by product count, as footer links. Pure so it can be unit
 * tested without pulling in the Meilisearch adapter (WB-085 N1/N8) — the
 * caller passes `facets.brands` straight from `getHomeCatalog()`.
 *
 * `handleMap` (WB-099 Task 5) resolves each brand to its `/brands/<handle>`
 * page via the shared `brandHref` join; a brand with no matching collection
 * handle falls back to the interim `/store?brands=<title>` filter link
 * rather than emitting a broken `/brands/undefined`.
 */
export function footerBrandLinks(
  brands: Record<string, number>,
  handleMap: BrandHandleMap,
  n = 5
): FooterLink[] {
  return Object.entries(brands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label]) => ({
      label,
      href: brandHref(label, handleMap),
    }))
}
