// backend/src/modules/wheel-size/normalize.ts
import { canonicalBoltPatterns } from "../vendor-sync/search/bolt-pattern-canonical"
import { RawByModel, RawWheelEntry, VehicleFitment, Window } from "./types"

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

function windowFrom(values: (number | null)[]): Window {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  if (!nums.length) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export function normalizeByModel(
  raw: RawByModel | null | undefined,
  source: { modificationSlug: string; region: string }
): VehicleFitment {
  const entry = raw?.data?.[0]
  if (!entry) {
    return { status: "not_found", canonicalBoltPatterns: [], hubBoreMm: null,
      diameterWindow: null, widthWindow: null, offsetWindow: null, source }
  }

  const tech = entry.technical ?? {}
  const studs = num(tech.stud_holes)
  const pcd = num(tech.pcd)
  const canonical = studs != null && pcd != null
    ? Array.from(new Set(canonicalBoltPatterns(`${studs}x${pcd}`)))
    : []

  // Defensive hub-bore read: technical.centre_bore, falling back to a top-level centre_bore.
  const hubBoreMm = num(tech.centre_bore) ?? num(entry.centre_bore)
  if (hubBoreMm == null) {
    // eslint-disable-next-line no-console
    console.warn("[wheel-size] centre_bore absent on by_model response", source)
  }

  // Aftermarket window = is_stock:false entries (front+rear merged), null rims skipped.
  const opt = (entry.wheels ?? []).filter((w: RawWheelEntry) => w.is_stock === false)
  const rims = opt.flatMap((w) => [w.front, w.rear]).filter(Boolean) as { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }[]

  return {
    status: "ok",
    canonicalBoltPatterns: canonical,
    hubBoreMm,
    diameterWindow: windowFrom(rims.map((r) => r.rim_diameter)),
    widthWindow: windowFrom(rims.map((r) => r.rim_width)),
    offsetWindow: windowFrom(rims.map((r) => r.rim_offset)),
    source,
  }
}
