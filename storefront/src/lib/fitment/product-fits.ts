/**
 * True when any of the product's canonical bolt patterns matches one of the
 * active vehicle's. Both sides are already canonicalized ("{count}x{pcd_mm}")
 * by the shared canonicalBoltPatterns util, so a set intersection is exact.
 */
export function productFitsVehicle(
  productPatterns: string[] | undefined,
  vehiclePatterns: string[] | undefined
): boolean {
  if (!productPatterns?.length || !vehiclePatterns?.length) return false
  const vehicle = new Set(vehiclePatterns)
  return productPatterns.some((p) => vehicle.has(p))
}
