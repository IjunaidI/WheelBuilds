import { canonicalizeTireSize } from "./canonicalize-tire-size"

/**
 * Pull the factory (is_stock) tire sizes out of a cached wheel-size `by_model`
 * body (`raw.data[].wheels[].front/rear.tire`). Front + rear are flattened into
 * one deduped, canonicalized set. Aftermarket (is_stock === false) is excluded.
 * Pure — reads the same cached `raw` reverse-fitment already consumes; no API calls.
 */
export function extractOemTireSizes(raw: unknown): string[] {
  const data = (raw as any)?.data
  if (!Array.isArray(data)) return []
  const out = new Set<string>()
  for (const entry of data) {
    for (const w of entry?.wheels ?? []) {
      if (w?.is_stock !== true) continue
      for (const side of [w.front, w.rear]) {
        const tire = typeof side?.tire === "string" ? side.tire : ""
        const canon = canonicalizeTireSize(tire)
        if (canon) out.add(canon)
      }
    }
  }
  return [...out]
}
