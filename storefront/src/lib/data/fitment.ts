import { sdk } from "@lib/config"
import type { VehicleFitment } from "@lib/garage/types"

export const getMakes = () => sdk.client.fetch<{ makes: any }>("/store/vehicle-catalog/makes")
export const getModels = (make: string) => sdk.client.fetch<{ models: any }>(`/store/vehicle-catalog/models?make=${make}`)
export const getYears = (make: string, model: string) => sdk.client.fetch<{ years: any }>(`/store/vehicle-catalog/years?make=${make}&model=${model}`)
export const getModifications = (make: string, model: string, year: string) =>
  sdk.client.fetch<{ modifications: any }>(`/store/vehicle-catalog/modifications?make=${make}&model=${model}&year=${year}`)

export async function getFitmentByVehicle(make: string, model: string, modification: string, region = "usdm"): Promise<VehicleFitment | { error: "unavailable" }> {
  try {
    const r = await sdk.client.fetch<{ fitment: VehicleFitment }>(
      `/store/fitment/by-vehicle?make=${make}&model=${model}&modification=${encodeURIComponent(modification)}&region=${region}`)
    return r.fitment
  } catch (e: any) {
    // Guard multiple error shapes: sdk.client.fetch may surface the status as e.status or e.response?.status.
    const status = e?.status ?? e?.response?.status
    if (status === 503) return { error: "unavailable" }
    throw e
  }
}
