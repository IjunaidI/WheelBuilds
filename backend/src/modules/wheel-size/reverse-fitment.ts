import { ReverseFitmentVehicle } from "./types"

type FitmentRow = {
  raw?: any
  canonical_bolt_patterns?: string[] | null
  hub_bore_mm_x100?: number | null
  status?: string
}

/**
 * Pull a display-ready vehicle identity out of a cached wheel-size `by_model`
 * body (`raw.data[0]`): make.name, model.name, trim, and a year label from
 * start_year/end_year. Returns null when make or model is missing.
 */
export function extractVehicleIdentity(
  raw: any
): { make: string; model: string; trim?: string; yearLabel: string } | null {
  const d = raw?.data?.[0]
  const make = d?.make?.name
  const model = d?.model?.name
  if (typeof make !== "string" || !make || typeof model !== "string" || !model) return null
  const trim = typeof d?.trim === "string" && d.trim ? d.trim : undefined
  const start = typeof d?.start_year === "number" ? d.start_year : null
  const end = typeof d?.end_year === "number" ? d.end_year : null
  const yearLabel =
    start != null && end != null
      ? start === end ? `${start}` : `${start}–${end}`
      : start != null ? `${start}` : ""
  return { make, model, trim, yearLabel }
}

/**
 * Hard-gate match: bolt-pattern intersection AND wheel bore clears the
 * vehicle hub (unknown values pass — never exclude on missing data). Mirrors
 * the storefront fits-vehicle.ts hard gates so the PDP list and the
 * active-vehicle band agree. Returns the matched canonical pattern, or null.
 */
export function matchedPattern(
  row: FitmentRow,
  productPatterns: string[],
  wheelBoreMm: number | null
): string | null {
  const rowPats = Array.isArray(row.canonical_bolt_patterns) ? row.canonical_bolt_patterns : []
  const hit = productPatterns.find((p) => rowPats.includes(p))
  if (!hit) return null
  const hub = typeof row.hub_bore_mm_x100 === "number" ? row.hub_bore_mm_x100 / 100 : null
  const boreOk = hub == null || wheelBoreMm == null ? true : wheelBoreMm >= hub
  return boreOk ? hit : null
}

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles
 * confirmed to fit the product (bolt + bore hard gates). `raw` supplies the
 * display identity; non-ok rows and identity-less rows are dropped.
 */
export function buildReverseFitment(
  rows: FitmentRow[],
  productPatterns: string[],
  wheelBoreMm: number | null,
  limit: number
): ReverseFitmentVehicle[] {
  if (!productPatterns.length) return []
  const seen = new Set<string>()
  const out: ReverseFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const pattern = matchedPattern(row, productPatterns, wheelBoreMm)
    if (!pattern) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ year: id.yearLabel, make: id.make, model: id.model, trim: id.trim, boltPattern: pattern })
  }
  out.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year.localeCompare(b.year)
  )
  return out.slice(0, limit)
}
