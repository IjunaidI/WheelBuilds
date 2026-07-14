// storefront/src/modules/discovery/data/price-range.ts
//
// WB-088 D8 — the price Min/Max filter inputs were pushing a full navigation
// (router.push, history entry) on every keystroke via `onChange`, with no
// validation: a negative number or min > max sailed straight into the URL
// and out to Meilisearch. This pure helper is the parse/clamp/swap step the
// filter-rail commits on blur/Enter (via `router.replace`, not `push`) —
// shared by both the wheel and tire discovery surfaces since the price block
// is duplicated verbatim between them.
//
// Units: takes the raw (dollar) strings as typed in the Min/Max inputs and
// returns a coherent {min, max} pair in the SAME unit (dollars) — the caller
// converts to cents when writing the committed value into the URL, mirroring
// how the inputs already convert cents -> dollars for display. Kept unit-
// agnostic here so the helper has no dependency on the cents convention.

export type CommittedPriceRange = { min?: number; max?: number }

/**
 * Parses a single raw input string to a non-negative number, or `undefined`
 * for blank/non-numeric input. Negatives clamp to 0 rather than being
 * rejected outright — a stray "-5" is far more likely a typo than an
 * intentional query for negative-priced wheels.
 */
const parseNonNegative = (raw: string): number | undefined => {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return undefined
  return Math.max(0, n)
}

/**
 * Parses + clamps the Min/Max price inputs into a coherent range: negatives
 * clamp to 0, blank/non-numeric strings become `undefined`, and if both are
 * present with min > max they are swapped so the committed range is never
 * inverted (which would otherwise zero out every Meilisearch hit).
 */
export function commitPriceRange(
  minStr: string,
  maxStr: string
): CommittedPriceRange {
  let min = parseNonNegative(minStr)
  let max = parseNonNegative(maxStr)

  if (min != null && max != null && min > max) {
    ;[min, max] = [max, min]
  }

  return { min, max }
}
