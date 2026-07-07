import type { VehicleFitment } from "@lib/garage/types"
import { getFitmentByVehicle } from "./fitment"

/**
 * `getFitmentByVehicle` has a throw/return contract: a 503 degrades to a
 * *returned* `{ error: "unavailable" }`, everything else (network blips,
 * unexpected 4xx/5xx) *throws* (WB-073 G8). Both the YMM pane's `submit` and
 * the garage pane's `selectVehicle` need to react to all three outcomes the
 * same way, so this helper collapses them into one discriminated result
 * instead of each caller hand-rolling its own try/catch around the fetch.
 *
 * Only the `getFitmentByVehicle` call itself is inside the try/catch here —
 * callers must keep any subsequent writes (garage `update()`, "no fitment
 * data" toasts, routing) OUTSIDE this helper so an unrelated failure there
 * is never misreported as a fitment-fetch failure.
 */
export type FitmentResolution =
  | { kind: "ok"; fitment: VehicleFitment }
  | { kind: "unavailable" }
  | { kind: "failed" }

export async function resolveFitmentForVehicle(
  make: string,
  model: string,
  modificationSlug: string,
  year: string,
  region = "usdm"
): Promise<FitmentResolution> {
  try {
    const fitment = await getFitmentByVehicle(make, model, modificationSlug, year, region)
    if (fitment && "error" in fitment) return { kind: "unavailable" }
    return { kind: "ok", fitment }
  } catch {
    return { kind: "failed" }
  }
}
