// backend/src/modules/wheel-size/normalize.ts
import { canonicalBoltPatterns } from "../vendor-sync/search/bolt-pattern-canonical"
import { RawByModel, RawWheelEntry, VehicleFitment, Window } from "./types"

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

// Loose numeric reader: accepts a JSON string ("67.1") OR a number. The real v2
// API returns technical.centre_bore as a STRING, which num() would drop to null.
const numLoose = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

function windowFrom(values: (number | null)[]): Window {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (!nums.length) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export function normalizeByModel(
  raw: RawByModel | null | undefined,
  source: { modificationSlug: string; region: string; trimNarrowed?: boolean }
): VehicleFitment {
  const entries = raw?.data ?? []
  if (!entries.length) {
    return { status: "not_found", canonicalBoltPatterns: [], hubBoreMm: null,
      diameterWindow: null, widthWindow: null, offsetWindow: null, oemTireSizes: [], oemTires: [], source }
  }

  // Bolt patterns: union across every trim (deduped).
  const canonical = Array.from(new Set(
    entries.flatMap((entry) => {
      const tech = entry.technical ?? {}
      const studs = num(tech.stud_holes)
      const pcd = num(tech.pcd)
      return studs != null && pcd != null ? canonicalBoltPatterns(`${studs}x${pcd}`) : []
    })
  ))

  // Hub bore: agree within 0.05mm across trims → that value; disagree → null (uncheckable, not wrong).
  const bores = entries
    .map((entry) => numLoose(entry.technical?.centre_bore) ?? numLoose(entry.centre_bore))
    .filter((v): v is number => v != null)
  let hubBoreMm: number | null = null
  if (bores.length) {
    const min = Math.min(...bores), max = Math.max(...bores)
    if (max - min <= 0.05) hubBoreMm = bores[0]
    else console.warn("[wheel-size] trims disagree on centre_bore; bore axis uncheckable", { ...source, bores })
  } else {
    console.warn("[wheel-size] centre_bore absent on by_model response", source)
  }

  // Windows: min/max over EVERY trim's rims, stock AND aftermarket (F2 — drop the is_stock filter).
  const rims = entries.flatMap((entry) =>
    (entry.wheels ?? []).flatMap((w: RawWheelEntry) => [w.front, w.rear]).filter(Boolean)
  ) as { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }[]

  return {
    status: "ok",
    canonicalBoltPatterns: canonical,
    hubBoreMm,
    diameterWindow: windowFrom(rims.map((r) => r.rim_diameter)),
    widthWindow: windowFrom(rims.map((r) => r.rim_width)),
    offsetWindow: windowFrom(rims.map((r) => r.rim_offset)),
    oemTireSizes: [],
    oemTires: [],
    source,
  }
}
