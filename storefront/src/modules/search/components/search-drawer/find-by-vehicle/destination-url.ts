export type FitmentTarget = "wheels" | "tires"

/**
 * Where a vehicle pick in the "find by vehicle" drawer should land. Wheels →
 * /store filtered by bolt pattern; tires → /tires filtered by OEM tire size.
 * Falls back to the bare path when the chosen target has no fit values.
 */
export function fitmentDestinationUrl(args: {
  countryCode: string
  target: FitmentTarget
  boltPatterns: string[]
  oemTireSizes: string[]
}): string {
  const { countryCode, target, boltPatterns, oemTireSizes } = args
  if (target === "tires") {
    const fit = oemTireSizes.length ? `?fit=${oemTireSizes.join(",")}` : ""
    return `/${countryCode}/tires${fit}`
  }
  const fit = boltPatterns.length ? `?fit=${boltPatterns.join(",")}` : ""
  return `/${countryCode}/store${fit}`
}
