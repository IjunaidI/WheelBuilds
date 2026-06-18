import { sdk } from "@lib/config"
import type { VehicleFitment } from "@lib/garage/types"
import type { FitmentEntry } from "@modules/product-detail/data/types"
import { unwrapFitment } from "./fitment-unwrap"

export const getMakes = () => sdk.client.fetch<{ makes: any }>("/store/vehicle-catalog/makes")
export const getModels = (make: string) => sdk.client.fetch<{ models: any }>(`/store/vehicle-catalog/models?make=${make}`)
export const getYears = (make: string, model: string) => sdk.client.fetch<{ years: any }>(`/store/vehicle-catalog/years?make=${make}&model=${model}`)
export const getModifications = (make: string, model: string, year: string) =>
  sdk.client.fetch<{ modifications: any }>(`/store/vehicle-catalog/modifications?make=${make}&model=${model}&year=${year}`)

/**
 * Reverse fitment for the PDP "confirmed models" list: cached vehicles that fit
 * this product's bolt patterns (+ bore). Server-side; best-effort cache via
 * Next revalidate. Returns [] on any error — the section degrades to 0 models.
 */
export async function getFitmentByProduct(
  boltPatternsCanonical: string[],
  boreMm?: number
): Promise<FitmentEntry[]> {
  if (!boltPatternsCanonical?.length) return []
  try {
    const params = new URLSearchParams({ boltPatterns: boltPatternsCanonical.join(",") })
    if (typeof boreMm === "number" && Number.isFinite(boreMm) && boreMm > 0) {
      params.set("boreMm", String(boreMm))
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

export async function getFitmentByVehicle(make: string, model: string, modification: string, year: string, region = "usdm"): Promise<VehicleFitment | { error: "unavailable" }> {
  try {
    // wheel-size /search/by_model/ REQUIRES year (or generation); modification only
    // narrows the trim. Omitting year => 400 => fitment never resolves => no filtering.
    const yearParam = year ? `&year=${encodeURIComponent(year)}` : ""
    const body = await sdk.client.fetch<unknown>(
      `/store/fitment/by-vehicle?make=${make}&model=${model}&modification=${encodeURIComponent(modification)}${yearParam}&region=${region}`)
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
