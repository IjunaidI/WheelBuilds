/**
 * Deterministic fitment cache key (WB-072 B1). The YEAR is always a key slot —
 * previously the key was `modificationSlug ?? year`, which dropped the year
 * whenever a trim slug was present, so trim slugs that repeat across generations
 * collided and served wrong-year fitment.
 *
 * WB-077: trailing "v2" version slot. Task 1 changed how fitment windows are
 * computed, so every key must change to orphan cached rows built under the old
 * logic and force them to re-warm. `parseCacheKey` (wheel-size-warm.ts) still
 * accepts legacy 5-slot keys, so this is an additive/non-breaking bump.
 */
export function buildFitmentCacheKey(p: {
  make: string
  model: string
  year?: string
  modificationSlug?: string
  region: string
}): string {
  return [p.make, p.model, p.year ?? "", p.modificationSlug ?? "", p.region, "v2"].join("|")
}
