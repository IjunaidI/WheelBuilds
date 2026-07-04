import { extractOemTires } from "./oem-tires"

/**
 * Pull the factory (is_stock) tire sizes out of a cached wheel-size `by_model`
 * body (`raw.data[].wheels[].front/rear.tire`). Front + rear are flattened into
 * one deduped, canonicalized set. Aftermarket (is_stock === false) is excluded.
 * Pure — reads the same cached `raw` reverse-fitment already consumes; no API calls.
 * Derived from the richer `extractOemTires` (size + load + speed); this keeps
 * the size-only shape for the coarse Meili filter + existing consumers.
 */
export function extractOemTireSizes(raw: unknown): string[] {
  return Array.from(new Set(extractOemTires(raw).map((t) => t.size)))
}
