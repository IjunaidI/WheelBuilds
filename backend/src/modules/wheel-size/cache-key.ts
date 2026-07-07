/**
 * Deterministic fitment cache key (WB-072 B1). The YEAR is always a key slot —
 * previously the key was `modificationSlug ?? year`, which dropped the year
 * whenever a trim slug was present, so trim slugs that repeat across generations
 * collided and served wrong-year fitment.
 */
export function buildFitmentCacheKey(p: {
  make: string
  model: string
  year?: string
  modificationSlug?: string
  region: string
}): string {
  return [p.make, p.model, p.year ?? "", p.modificationSlug ?? "", p.region].join("|")
}
