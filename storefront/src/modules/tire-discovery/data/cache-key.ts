import type { TireDiscoveryQuery } from "./types"

/** Stable, order-independent unstable_cache key; the "tire" tag prevents any
 *  collision with the wheel "discovery" cache namespace. */
export function tireDiscoveryCacheKey(query: TireDiscoveryQuery): string {
  const f = query.filters
  const norm = (a: ReadonlyArray<string | number>) => [...a].map(String).sort().join(",")
  return JSON.stringify({
    _t: "tire",
    brands: norm(f.brands),
    rimDiameters: norm(f.rimDiameters),
    sizes: norm(f.sizes),
    tireTypes: norm(f.tireTypes),
    speedRatings: norm(f.speedRatings),
    loadIndexes: norm(f.loadIndexes),
    priceMin: f.priceMinCents ?? null,
    priceMax: f.priceMaxCents ?? null,
    sort: query.sort,
    page: query.page,
    q: query.q ?? "",
    fit: query.vehicleTireSizes ? [...query.vehicleTireSizes].sort().join(",") : "",
  })
}
