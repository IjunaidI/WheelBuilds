/**
 * Real catalog price bounds for the filter rail's Price section
 * (WB-120 Q-15).
 *
 * The rail's min/max inputs carried hard-coded `$0` / `$2,500` placeholders
 * and a standing `TODO(integration)` to become a slider "once a real min/max
 * range comes from Meilisearch's price aggregation". This is that
 * aggregation: Meilisearch returns `facetStats` for any NUMERIC filterable
 * attribute, and `price_min`/`price_max` already are filterable — no index
 * change needed. Verified live 2026-07-29: `{ min: 7800, max: 245000 }`.
 *
 * ⚠️ UNITS. The index stores INTEGER CENTS (`buildSearchDocument` writes
 * `Math.round(major * 100)`), while the rail's inputs are dollars. This is the
 * conversion boundary — see the price-unit convention in the root CLAUDE.md.
 *
 * Returns `null` rather than a guess when stats are missing or unusable, so
 * callers fall back to their existing static placeholders. A fabricated bound
 * would silently exclude real products from a shopper's range.
 */

export type FacetStats = Record<string, { min?: number; max?: number }> | undefined

export type PriceBounds = {
  /** Whole dollars, floored — never excludes the cheapest product. */
  minUsd: number
  /** Whole dollars, ceiled — never excludes the dearest product. */
  maxUsd: number
}

export function priceBoundsFromFacetStats(stats: FacetStats): PriceBounds | null {
  const minCents = stats?.price_min?.min
  const maxCents = stats?.price_max?.max ?? stats?.price_min?.max

  if (typeof minCents !== "number" || typeof maxCents !== "number") return null
  if (!Number.isFinite(minCents) || !Number.isFinite(maxCents)) return null
  if (minCents < 0 || maxCents < 0) return null

  const minUsd = Math.floor(minCents / 100)
  const maxUsd = Math.ceil(maxCents / 100)

  // A collapsed or inverted range is not a usable bound.
  if (maxUsd <= minUsd) return null

  return { minUsd, maxUsd }
}
