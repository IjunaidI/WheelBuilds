// storefront/src/modules/discovery/data/vehicle-constraint.ts
import { lit } from "./escape"

export function vehicleToConstraints(v: { canonicalBoltPatterns?: string[] }): string[] {
  const patterns = v.canonicalBoltPatterns ?? []
  if (!patterns.length) return []
  const ors = patterns.map((p) => `bolt_patterns_canonical = ${lit(p)}`).join(" OR ")
  return [`(${ors})`]
}

/** Serialize patterns for the `fit` URL param; parse mirrors this. */
export const patternsToFitParam = (patterns: string[]): string => patterns.join(",")
export const fitParamToPatterns = (raw: string): string[] =>
  raw.split(",").map((s) => s.trim()).filter(Boolean)
