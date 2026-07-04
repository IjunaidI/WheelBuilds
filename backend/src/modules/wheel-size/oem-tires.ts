import { canonicalizeTireSize } from "./canonicalize-tire-size"
import { OemTire } from "./types"

/** Factory (is_stock) tires with size + load + speed, front+rear flattened + deduped.
 *  Reads the same cached raw as extractOemTireSizes; superset of it. */
export function extractOemTires(raw: unknown): OemTire[] {
  const data = (raw as any)?.data
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: OemTire[] = []
  for (const entry of data) {
    for (const w of entry?.wheels ?? []) {
      if (w?.is_stock !== true) continue
      for (const side of [w.front, w.rear]) {
        const size = canonicalizeTireSize(typeof side?.tire === "string" ? side.tire : "")
        if (!size) continue
        const loadIndex = typeof side?.load_index === "number" ? side.load_index : null
        const speedRating = typeof side?.speed_index === "string" && side.speed_index ? side.speed_index : null
        const key = `${size}|${loadIndex ?? ""}|${speedRating ?? ""}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ size, loadIndex, speedRating })
      }
    }
  }
  return out
}
