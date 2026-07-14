/**
 * Number of products shown in the home page's "New Arrivals" row
 * (new-drops-row). The Catalog Wall (catalog-wall) must skip this same
 * count of newest products so it never repeats one already shown in New
 * Arrivals directly above it (WB-085 N6/X-fix). Shared here so the two
 * components can't drift out of sync.
 */
export const NEW_ARRIVALS_COUNT = 6
