/**
 * Pure pagination math shared by the wheel (`/store`) and tire (`/tires`)
 * discovery route pages + templates (WB-088 D11).
 *
 * Before this fix, an out-of-range `?page` (e.g. a stale bookmark/shared
 * link after the catalog shrank, or a shopper hand-editing the URL) fetched
 * an empty `hits` page from Meilisearch while `totalCount` still correctly
 * reported the real, non-zero match count for the filters — so the route
 * rendered the 0-match `<DiscoveryEmpty>`/`<TireEmpty>` state for a filter
 * combination that genuinely has results, just not on the requested page.
 *
 * `totalPagesFor` is the single source of truth for "how many pages does
 * this result set have" (always >= 1 — an empty result set still has one,
 * empty, page) so the templates' pagination math and the route's clamp
 * check can never drift from each other. `clampPage` folds a page number
 * into `[1, totalPagesFor(...)]`.
 */
export function totalPagesFor(totalCount: number, pageSize: number): number {
  if (!pageSize || pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalCount / pageSize))
}

export function clampPage(page: number, totalCount: number, pageSize: number): number {
  const last = totalPagesFor(totalCount, pageSize)
  return Math.min(Math.max(1, page), last)
}

/**
 * Rebuilds a URL query string from a parsed search-params record, replacing
 * `page` with the given value (omitted entirely when `page <= 1`, matching
 * this app's convention elsewhere of never writing `page=1` to the URL —
 * see `useDiscoveryQuery`/`useTireQuery`'s `setPage`). Used by the `/store`
 * and `/tires` route pages to build the out-of-range-page redirect target
 * (WB-088 D11) while preserving every other filter/sort/search param.
 */
export function withClampedPage(
  sp: Record<string, string | string[] | undefined>,
  page: number
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (key === "page" || value == null) continue
    if (Array.isArray(value)) value.forEach((v) => next.append(key, v))
    else next.append(key, value)
  }
  if (page > 1) next.set("page", String(page))
  return next.toString()
}
