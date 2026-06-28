import type { DiscoveryQuery } from "./types"

/**
 * Stable, order-independent cache key for a DiscoveryQuery. Used as the
 * `unstable_cache` key part so two requests with the same effective filters
 * (regardless of array order) share one cached Meilisearch result.
 */
export function discoveryCacheKey(query: DiscoveryQuery): string {
  const f = query.filters
  const norm = (a: ReadonlyArray<string | number>) =>
    [...a].map(String).sort().join(",")

  return JSON.stringify({
    brands: norm(f.brands),
    diameters: norm(f.diameters),
    boltPatterns: norm(f.boltPatterns),
    finishes: norm(f.finishes),
    priceMin: f.priceMinCents ?? null,
    priceMax: f.priceMaxCents ?? null,
    sort: query.sort,
    page: query.page,
    q: query.q ?? "",
    vehicleConstraint: query.vehicleConstraint
      ? [...query.vehicleConstraint].sort().join("|")
      : "",
  })
}
