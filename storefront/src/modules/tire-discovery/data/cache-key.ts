import type { OemTire } from "@lib/garage/types"
import type { TireDiscoveryQuery } from "./types"

/** Stable, order-independent unstable_cache key; the "tire" tag prevents any
 *  collision with the wheel "discovery" cache namespace.
 *
 * WB-068: `vehicleOemTires` carries size + load + speed, so a multi-axis fit
 * query (e.g. same size, higher load index) must cache distinctly from a
 * size-only one — sort by the FULL composite key (not just size) so entries
 * are order-independent without collapsing distinct load/speed combos onto
 * the same key. */
function oemTireKey(o: OemTire): string {
  return `${o.size}|${o.loadIndex ?? ""}|${o.speedRating ?? ""}`
}

export function tireDiscoveryCacheKey(query: TireDiscoveryQuery): string {
  const f = query.filters
  const norm = (a: ReadonlyArray<string | number>) => [...a].map(String).sort().join(",")
  const sortedTires = [...(query.vehicleOemTires ?? [])].sort((a, b) =>
    oemTireKey(a).localeCompare(oemTireKey(b))
  )
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
    fit: sortedTires.map((o) => o.size).join(","),
    fitl: sortedTires.map((o) => o.loadIndex ?? "").join(","),
    fits: sortedTires.map((o) => o.speedRating ?? "").join(","),
  })
}
