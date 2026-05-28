/**
 * Convert a vendor bolt-pattern string into canonical PCD form(s):
 *   "{lugCount}x{pcdMillimetres}"  e.g. "5x114.3", "6x139.7"
 *
 * - Values < 20 are treated as inches and converted to mm (×25.4); values
 *   >= 20 are already mm. (Mirrors parse-helpers' inch/mm heuristic.)
 * - The mm value is rounded to one decimal and snapped to the nearest
 *   standard PCD when within 1.0 mm.
 * - Dual-drilled patterns ("6X135/5.5") share the lug count and yield one
 *   entry per circle.
 * - Unparseable input yields an empty array.
 *
 * This canonical form MUST match the format used on the wheel-size.com side
 * in Spec 2 — it is the fitment join key.
 */

const STANDARD_PCDS = [
  98, 100, 105, 108, 110, 112, 114.3, 115, 118, 120, 120.65, 127, 130, 135,
  139.7, 150, 160, 165.1, 170, 205,
]

function toMillimetres(raw: number): number {
  return raw < 20 ? raw * 25.4 : raw
}

function snap(mm: number): number {
  const rounded = Math.round(mm * 10) / 10
  let best = rounded
  let bestDelta = Infinity
  for (const std of STANDARD_PCDS) {
    const delta = Math.abs(std - rounded)
    if (delta < bestDelta) {
      bestDelta = delta
      best = std
    }
  }
  return bestDelta <= 1.0 ? best : rounded
}

function format(count: number, mm: number): string {
  // JS's String() never produces a trailing ".0" for integer-valued numbers,
  // so 127.0 → "127" and 114.3 → "114.3" naturally.
  return `${count}x${mm}`
}

export function canonicalBoltPatterns(input: string): string[] {
  if (!input) return []
  const cleaned = input.trim().toUpperCase()

  // Expect "{count}X{circle}[/{circle}...]" — e.g. "6X135/5.5".
  const match = cleaned.match(/^(\d+)\s*X\s*(.+)$/)
  if (!match) return []

  const count = parseInt(match[1], 10)
  if (!Number.isFinite(count) || count <= 0) return []

  const circles = match[2].split("/").map((s) => parseFloat(s.trim()))
  const out: string[] = []
  for (const c of circles) {
    if (!Number.isFinite(c) || c <= 0) continue
    const mm = snap(toMillimetres(c))
    out.push(format(count, mm))
  }
  return out
}
