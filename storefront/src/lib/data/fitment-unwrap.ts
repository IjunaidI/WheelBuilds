import type { VehicleFitment } from "@lib/garage/types"

/**
 * The /store/fitment/by-vehicle route returns the fitment wrapped in
 * `{ fitment }` (consistent with the sibling /store/vehicle-catalog routes).
 * An earlier build returned the bare object, which silently starved the whole
 * fitment filter. Accept BOTH shapes so an envelope drift can never again
 * break fitment without a test catching it.
 */
export function unwrapFitment(body: unknown): VehicleFitment | null {
  if (!body || typeof body !== "object") return null
  const obj = body as Record<string, unknown>
  const candidate = ("fitment" in obj ? obj.fitment : obj) as Record<string, unknown> | null
  if (!candidate || typeof candidate !== "object") return null
  if (!("status" in candidate) || !("canonicalBoltPatterns" in candidate)) return null
  return candidate as unknown as VehicleFitment
}
