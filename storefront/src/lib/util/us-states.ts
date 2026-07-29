/**
 * US state reference + input normaliser (WB-118 Q-07).
 *
 * The checkout province field was a free-text `<Input>`, so "Chicago" in the
 * state box passed validation, was written to `shipping_address.province`,
 * and then fed both the tax lookup and the shipping label — producing the
 * wrong tax and an undeliverable address with no error at any point. The QA
 * tester flagged it as "maybe not an issue"; it is one.
 *
 * Medusa stores `province` as a plain string with no validation of its own,
 * so the constraint has to live on this side.
 *
 * Sorted by name: the list is rendered directly into the picker, and
 * `us-states.test.ts` pins the ordering so an insertion can't quietly land in
 * the wrong place.
 */

export type UsState = { code: string; name: string }

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
]

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s.code]))
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]))

/**
 * `"Illinois"` / `"il"` / `"IL"` → `"IL"`. Anything else — a city, junk, an
 * empty string, a non-string — → `null`.
 *
 * Used both to validate input and to migrate a saved address whose province
 * predates the picker: `"Illinois"` resolves and preselects, while `"Chicago"`
 * resolves to null so the shopper is forced to pick a real state rather than
 * silently carrying junk into the tax lookup.
 */
export function normalizeUsState(input: string): string | null {
  if (typeof input !== "string") return null
  const trimmed = input.trim()
  if (!trimmed) return null
  return (
    BY_CODE.get(trimmed.toUpperCase()) ?? BY_NAME.get(trimmed.toLowerCase()) ?? null
  )
}
