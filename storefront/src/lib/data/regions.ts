import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { cache } from "react"
import { HttpTypes } from "@medusajs/types"

export const listRegions = cache(async function () {
  return sdk.store.region
    .list({}, { next: { tags: ["regions"] } })
    .then(({ regions }) => regions)
    .catch(medusaError)
})

export const retrieveRegion = cache(async function (id: string) {
  return sdk.store.region
    .retrieve(id, {}, { next: { tags: ["regions"] } })
    .then(({ region }) => region)
    .catch(medusaError)
})

const regionMap = new Map<string, HttpTypes.StoreRegion>()

/**
 * Pure lookup: given an already-fetched region list, find the region for
 * countryCode (falls back to "us" when countryCode is empty/falsy — mirrors
 * the historical getRegion default). Returns null ONLY when the fetch
 * succeeded but no region matches that country — the legitimate "no region
 * for this countryCode" case. A fetch/transport failure is a different
 * failure mode entirely (see getRegion below) and must never be collapsed
 * into this same null (WB-090 P9).
 */
export function regionForCountry(
  regions: HttpTypes.StoreRegion[] | null | undefined,
  countryCode: string
): HttpTypes.StoreRegion | null {
  const code = countryCode || "us"
  for (const region of regions ?? []) {
    for (const country of region.countries ?? []) {
      if ((country?.iso_2 ?? "") === code) {
        return region
      }
    }
  }
  return null
}

export const getRegion = cache(async function (countryCode: string) {
  if (regionMap.has(countryCode)) {
    return regionMap.get(countryCode)
  }

  // Deliberately NOT wrapped in try/catch: listRegions() throws on a genuine
  // fetch/transport failure (outage), and that must propagate all the way up
  // to the calling page so Next.js renders the nearest error.tsx boundary
  // instead of this collapsing into a null that PDP (and others) read as
  // "no such region" and 404 on. Only a successful fetch with no matching
  // region should produce a null — that's regionForCountry's job below.
  const regions = await listRegions()

  regions.forEach((region) => {
    region.countries?.forEach((c) => {
      regionMap.set(c?.iso_2 ?? "", region)
    })
  })

  return regionForCountry(regions, countryCode)
})
