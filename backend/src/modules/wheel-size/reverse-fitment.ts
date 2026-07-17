import { ReverseFitmentVehicle, Window } from "./types"
import { boreClears } from "./bore-clearance"
import { subModelsForModelYear } from "./sub-models"

type FitmentRow = {
  raw?: any
  canonical_bolt_patterns?: string[] | null
  hub_bore_mm_x100?: number | null
  status?: string
  diameter_window?: Window
  width_window?: Window
  offset_window?: Window
}

/** One of a product's buildable (diameter, width, offset) combinations, in the
 * same units as the vehicle's spec windows (inches / inches / mm). */
export type ProductSize = { diameter: number; width: number; offset: number }

const inWin = (v: number, w: Window | null | undefined): boolean =>
  !w ? true : v >= w.min && v <= w.max

/**
 * True when at least one of the product's sizes falls within ALL THREE of the
 * vehicle row's spec windows (diameter, width, offset) — the same per-size
 * conjunction the storefront's fitsVehicle/variantFitsVehicle/buildFitView use
 * for the active-vehicle band, so the PDP "confirmed models" list and the band
 * agree (WB-072 S2). A null window can't be checked, so it passes.
 *
 * BACKWARD-COMPAT: when `sizes` is empty (no caller-supplied sizes), the gate
 * is skipped entirely (returns true) so callers that don't pass sizes keep the
 * pre-S2 bolt+bore-only behavior.
 */
export function sizeInWindow(sizes: ProductSize[], row: FitmentRow): boolean {
  if (!sizes.length) return true
  return sizes.some(
    (s) =>
      inWin(s.diameter, row.diameter_window) &&
      inWin(s.width, row.width_window) &&
      inWin(s.offset, row.offset_window)
  )
}

/**
 * Pull a display-ready vehicle identity out of a cached wheel-size `by_model`
 * body: make.name, model.name, a sub-model trim label, and a year label from
 * start_year/end_year — all read off `raw.data[0]` except the trim label.
 * Returns null when make or model is missing.
 *
 * WB-104 T1: WB-077 made a cached row's `raw.data` cover EVERY trim the
 * vehicle query matched (a "union" row) when there's more than one, so
 * picking an arbitrary entry's trim would display it as if it were the only
 * trim this fitment applies to.
 *
 * WB-113: the trim label now surfaces the marketing **sub-model**
 * (`trim_levels`) instead of the engine "modification" name (the old
 * `.trim` field) — the sub-model is the axis the vehicle selector narrows
 * by going forward. WB-104's honesty rule carries over unchanged in spirit:
 * a multi-entry row only keeps a sub-model label when EVERY entry both
 * carries `trim_levels` data AND the union of all of them (subModelsForModelYear)
 * collapses to exactly one distinct value. An entry with no `trim_levels` at
 * all counts against the claim (same as the old code's "missing trim is its
 * own distinct value") — a mixed known/unknown-sub-model union (e.g. one
 * entry tags "Sport", another has no trim_levels) is NOT collapsed down to
 * the one named sub-model; it claims none at all, same as a genuine union of
 * >1 distinct sub-models. `trimNarrowed` (`raw.data.length === 1`) tells
 * callers whether the row was ever narrowed to one specific entry,
 * independent of whether that entry's sub-model happened to be nameable.
 */
export function extractVehicleIdentity(
  raw: any
): { make: string; model: string; trim?: string; yearLabel: string; trimNarrowed: boolean } | null {
  const data: any[] = Array.isArray(raw?.data) ? raw.data : []
  const d = data[0]
  const make = d?.make?.name
  const model = d?.model?.name
  if (typeof make !== "string" || !make || typeof model !== "string" || !model) return null
  const trimNarrowed = data.length === 1
  // Every entry must carry non-empty trim_levels (a missing one is NOT
  // ignored — it blocks the claim, same as the old "missing trim counts as
  // its own distinct value" rule) AND the union across all of them must
  // collapse to exactly one distinct sub-model.
  const allHaveSubModels = data.length > 0 && data.every((e) => Array.isArray(e?.trim_levels) && e.trim_levels.length > 0)
  const subModels = subModelsForModelYear(data)
  const trim: string | undefined = allHaveSubModels && subModels.length === 1 ? subModels[0] : undefined
  const start = typeof d?.start_year === "number" ? d.start_year : null
  const end = typeof d?.end_year === "number" ? d.end_year : null
  const yearLabel =
    start != null && end != null
      ? start === end ? `${start}` : `${start}–${end}`
      : start != null ? `${start}` : ""
  return { make, model, trim, yearLabel, trimNarrowed }
}

/**
 * Hard-gate match: bolt-pattern intersection AND (at least one of) the
 * wheel's bore(s) clears the vehicle hub (unknown values pass — never
 * exclude on missing data). Mirrors the storefront fits-vehicle.ts hard
 * gates so the PDP list and the active-vehicle band agree. Returns the
 * matched canonical pattern, or null.
 *
 * WB-091 P5: `wheelBoreMm` may be the product's full per-size bore SET (one
 * entry per buildable size) instead of a single value — a multi-bore wheel's
 * "confirmed models" list is no longer gated by whichever variant happened
 * to be `variants[0]`; it matches this vehicle if ANY of the wheel's bores
 * clears the hub. A bare number (or null) still works unchanged.
 */
export function matchedPattern(
  row: FitmentRow,
  productPatterns: string[],
  wheelBoreMm: number | (number | null)[] | null
): string | null {
  const rowPats = Array.isArray(row.canonical_bolt_patterns) ? row.canonical_bolt_patterns : []
  const hit = productPatterns.find((p) => rowPats.includes(p))
  if (!hit) return null
  const hub = typeof row.hub_bore_mm_x100 === "number" ? row.hub_bore_mm_x100 / 100 : null
  const bores = Array.isArray(wheelBoreMm) ? wheelBoreMm : [wheelBoreMm]
  // No bores supplied at all → same as an unknown single bore: pass (never
  // exclude on missing data).
  const boreOk = bores.length === 0 ? boreClears(null, hub) : bores.some((b) => boreClears(b, hub))
  return boreOk ? hit : null
}

/**
 * Reduce cached fitment rows to a deduped, sorted, capped list of vehicles
 * confirmed to fit the product (bolt + bore hard gates, PLUS an in-window size
 * when `productSizes` is supplied — WB-072 S2). `raw` supplies the display
 * identity; non-ok rows and identity-less rows are dropped.
 */
export function buildReverseFitment(
  rows: FitmentRow[],
  productPatterns: string[],
  wheelBoreMm: number | (number | null)[] | null,
  limit: number,
  productSizes: ProductSize[] = []
): ReverseFitmentVehicle[] {
  if (!productPatterns.length) return []
  const seen = new Set<string>()
  const out: ReverseFitmentVehicle[] = []
  for (const row of rows) {
    if (row.status && row.status !== "ok") continue
    const pattern = matchedPattern(row, productPatterns, wheelBoreMm)
    if (!pattern) continue
    if (!sizeInWindow(productSizes, row)) continue
    const id = extractVehicleIdentity(row.raw)
    if (!id) continue
    const key = `${id.make}|${id.model}|${id.trim ?? ""}|${id.yearLabel}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      year: id.yearLabel,
      make: id.make,
      model: id.model,
      trim: id.trim,
      trimNarrowed: id.trimNarrowed,
      boltPattern: pattern,
    })
  }
  out.sort(
    (a, b) =>
      a.make.localeCompare(b.make) ||
      a.model.localeCompare(b.model) ||
      a.year.localeCompare(b.year)
  )
  return out.slice(0, limit)
}
