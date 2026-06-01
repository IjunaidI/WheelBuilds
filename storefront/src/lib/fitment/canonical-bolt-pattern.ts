// storefront/src/lib/fitment/canonical-bolt-pattern.ts
// LOCKSTEP TWIN of backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts.
// The shared golden-vector test (fixtures/bolt-pattern-canonical-golden.json) guards drift. Keep in sync.
const STANDARD_PCDS = [
  98, 100, 105, 108, 110, 112, 114.3, 115, 118, 120, 120.65, 127, 130, 135,
  139.7, 150, 160, 165.1, 170, 205,
] // NOTE: if Task 2 extended this on the backend, add the same entries here.
const toMillimetres = (raw: number): number => (raw < 20 ? raw * 25.4 : raw)
function snap(mm: number): number {
  const rounded = Math.round(mm * 10) / 10
  let best = rounded, bestDelta = Infinity
  for (const std of STANDARD_PCDS) {
    const delta = Math.abs(std - rounded)
    if (delta < bestDelta) { bestDelta = delta; best = std }
  }
  return bestDelta <= 1.0 ? best : rounded
}
const format = (count: number, mm: number): string => `${count}x${mm}`
export function canonicalBoltPatterns(input: string): string[] {
  const cleaned = (input ?? "").trim().toUpperCase()
  const match = cleaned.match(/^(\d+)\s*X\s*(.+)$/)
  if (!match) return []
  const count = parseInt(match[1], 10)
  if (!Number.isFinite(count) || count <= 0) return []
  const out: string[] = []
  for (const part of match[2].split("/")) {
    const c = parseFloat(part.trim())
    if (Number.isFinite(c) && c > 0) out.push(format(count, snap(toMillimetres(c))))
  }
  return out
}
