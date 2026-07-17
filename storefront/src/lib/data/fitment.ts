import { sdk } from "@lib/config"
import type { VehicleFitment } from "@lib/garage/types"
import type { FitmentEntry, TireFitmentEntry } from "@modules/product-detail/data/types"
import { unwrapFitment } from "./fitment-unwrap"

export const getMakes = () => sdk.client.fetch<{ makes: any }>("/store/vehicle-catalog/makes")
export const getModels = (make: string) => sdk.client.fetch<{ models: any }>(`/store/vehicle-catalog/models?make=${make}`)
export const getYears = (make: string, model: string) => sdk.client.fetch<{ years: any }>(`/store/vehicle-catalog/years?make=${make}&model=${model}`)
// WB-113: the sub-model union (L/LE/LE Eco/…) — the store route kept its
// PATH (`/vehicle-catalog/modifications`, minimizing churn — Task 3) but
// its response key changed from the engine `modifications: {slug,name}[]`
// to `subModels: string[]`. Renamed from `getModifications` for clarity;
// value === label now (no slug/name split — see `to-options.ts`'s twin
// `toSubModelOptions`).
export const getSubModels = (make: string, model: string, year: string) =>
  sdk.client.fetch<{ subModels: string[] }>(`/store/vehicle-catalog/modifications?make=${make}&model=${model}&year=${year}`)

/**
 * Reverse fitment for the PDP "confirmed models" list: cached vehicles that fit
 * this product's bolt patterns (+ bore) AND have at least one buildable size
 * (diameter/width/offset) inside that vehicle's spec windows (WB-072 S2) — the
 * same gate the active-vehicle band uses, so the two can't contradict each
 * other on the same page. `sizes` is optional; omitting it (or passing an
 * empty array) falls back to the pre-S2 bolt+bore-only match. Server-side;
 * best-effort cache via Next revalidate. Returns [] on any error — the section
 * degrades to 0 models.
 *
 * `boreMm` accepts the product's full per-size bore SET (one entry per
 * buildable size) in addition to a single value (WB-091 P5) — a multi-bore
 * wheel matches a cached vehicle if ANY of its bores clears that vehicle's
 * hub, instead of being gated by whichever variant happened to be
 * `variants[0]`.
 */
export async function getFitmentByProduct(
  boltPatternsCanonical: string[],
  boreMm?: number | (number | null | undefined)[],
  sizes?: { diameter: number; width: number; offset: number }[]
): Promise<FitmentEntry[]> {
  if (!boltPatternsCanonical?.length) return []
  try {
    const params = new URLSearchParams({ boltPatterns: boltPatternsCanonical.join(",") })
    const boreValues = (Array.isArray(boreMm) ? boreMm : boreMm != null ? [boreMm] : []).filter(
      (b): b is number => typeof b === "number" && Number.isFinite(b) && b > 0
    )
    if (boreValues.length) {
      params.set("boreMm", boreValues.join(","))
    }
    const validSizes = (sizes ?? []).filter(
      (s) => Number.isFinite(s.diameter) && Number.isFinite(s.width) && Number.isFinite(s.offset)
    )
    if (validSizes.length) {
      params.set("diameters", validSizes.map((s) => s.diameter).join(","))
      params.set("widths", validSizes.map((s) => s.width).join(","))
      params.set("offsets", validSizes.map((s) => s.offset).join(","))
    }
    const body = await sdk.client.fetch<{ vehicles: FitmentEntry[] }>(
      `/store/fitment/by-product?${params.toString()}`,
      { next: { revalidate: 300 } } as any
    )
    return Array.isArray(body?.vehicles) ? body.vehicles : []
  } catch {
    return []
  }
}

/**
 * Reverse tire fitment for the tire PDP "confirmed models" list: cached vehicles
 * whose factory tire size + load index + speed rating meet-or-exceed this
 * product's per-variant specs. Server-side; best-effort cache via Next
 * revalidate. Returns [] on any error (section degrades).
 *
 * `sizes`/`loads`/`speeds` are sent as three ALIGNED CSVs — the route zips them
 * by index — so entries with a blank size are filtered out FIRST, then all
 * three CSVs are built from that same filtered list.
 */
export async function getFitmentByTireProduct(
  specs: { size: string; loadIndex: number | null; speedRating: string | null }[]
): Promise<TireFitmentEntry[]> {
  if (!specs?.length) return []
  const withSize = specs.filter((s) => s.size)
  if (!withSize.length) return []
  try {
    const params = new URLSearchParams()
    params.set("sizes", withSize.map((s) => s.size).join(","))
    params.set("loads", withSize.map((s) => s.loadIndex ?? "").join(","))
    params.set("speeds", withSize.map((s) => s.speedRating ?? "").join(","))
    const body = await sdk.client.fetch<{ vehicles: TireFitmentEntry[] }>(
      `/store/fitment/by-tire-product?${params.toString()}`,
      { next: { revalidate: 300 } } as any
    )
    return Array.isArray(body?.vehicles) ? body.vehicles : []
  } catch {
    return []
  }
}

export async function getFitmentByVehicle(make: string, model: string, subModel: string, year: string, region = "usdm"): Promise<VehicleFitment | { error: "unavailable" }> {
  try {
    // wheel-size /search/by_model/ REQUIRES year (or generation); sub_model only
    // narrows the trim. Omitting year => 400 => fitment never resolves => no filtering.
    // WB-113: `sub_model` replaces the old `modification` (engine-slug) param —
    // send the literal string "Base" for "no sub-model selected", never "".
    const yearParam = year ? `&year=${encodeURIComponent(year)}` : ""
    const body = await sdk.client.fetch<unknown>(
      `/store/fitment/by-vehicle?make=${make}&model=${model}&sub_model=${encodeURIComponent(subModel)}${yearParam}&region=${region}`)
    const fitment = unwrapFitment(body)
    // null means a malformed/unrecognized response shape; treat as unavailable —
    // the YMM pane only distinguishes fitment vs. error.
    if (!fitment) return { error: "unavailable" }
    return fitment
  } catch (e: any) {
    // Guard multiple error shapes: sdk.client.fetch may surface the status as e.status or e.response?.status.
    const status = e?.status ?? e?.response?.status
    if (status === 503) return { error: "unavailable" }
    throw e
  }
}
