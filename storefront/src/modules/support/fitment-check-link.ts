/**
 * Builds the `/contact` href behind the "Submit your vehicle for a fitment
 * check" CTAs on both PDPs (WB-119 Q-20).
 *
 * Before this, the tyre PDP's CTA linked to a `/contact` page with no form on
 * it, under copy promising a reply within 24 hours — so the highest-intent
 * lead the site can capture (a shopper whose vehicle we can't confirm,
 * actively raising their hand) went nowhere at all. The wheel PDP had no such
 * CTA in the first place.
 *
 * Pure and shared so the two PDPs cannot drift into different param names —
 * `/contact` reads exactly these keys.
 */

export type FitmentCheckLinkInput = {
  /** The active garage vehicle, if one is set. */
  vehicle?: {
    year: number
    make: string
    model: string
    modificationSlug?: string
  } | null
  /** Handle of the product being viewed, so the reply has context. */
  productHandle?: string | null
}

/** "2019 Toyota Corolla LE" — omits an absent sub-model rather than padding. */
export function vehicleLabel(v: FitmentCheckLinkInput["vehicle"]): string | null {
  if (!v) return null
  const parts = [v.year, v.make, v.model, v.modificationSlug]
    .filter((p) => p !== undefined && p !== null && String(p).trim() !== "")
    .map((p) => String(p).trim())
  return parts.length ? parts.join(" ") : null
}

export function fitmentCheckHref(input: FitmentCheckLinkInput = {}): string {
  const params = new URLSearchParams({
    subject: "Fitment check",
    source: "fitment-check",
  })

  const label = vehicleLabel(input.vehicle)
  if (label) params.set("vehicle", label)
  if (input.productHandle) params.set("product", input.productHandle)

  return `/contact?${params.toString()}`
}
