/**
 * Dual-unit label for a canonical bolt pattern ("{count}x{pcd_mm}", e.g.
 * "5x114.3") — WB-088 D4. Renders "5×114.3 (5×4.5″)" so a shopper used to
 * inch PCDs (a US convention) sees both units on one checkbox, instead of
 * the facet splitting one physical pattern into raw-string variants
 * (see backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts,
 * which produces the canonical value this labels).
 *
 * Curated for standard PCDs; falls back to a computed mm/25.4 conversion
 * for anything not in the table. A value that doesn't match the canonical
 * shape passes through unchanged (defensive — e.g. a stray raw/placeholder
 * value reaching this helper renders as-is rather than throwing).
 */

const PCD_INCH: Record<string, string> = {
  "114.3": "4.5",
  "139.7": "5.5",
  "127": "5",
  "120": "4.72",
  "100": "3.94",
  "108": "4.25",
  "112": "4.41",
  "130": "5.12",
  "150": "5.9",
  "165.1": "6.5",
  "170": "6.69",
}

const CANONICAL_RE = /^(\d+)x([\d.]+)$/

export function pcdInchLabel(canonical: string): string {
  const match = CANONICAL_RE.exec(canonical)
  if (!match) return canonical

  const [, count, mm] = match
  const inch = PCD_INCH[mm] ?? (Number(mm) / 25.4).toFixed(2)

  return `${count}×${mm} (${count}×${inch}″)`
}
