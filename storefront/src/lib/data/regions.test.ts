// storefront/src/lib/data/regions.test.ts
//
// WB-090 P9 — getRegion must distinguish a genuine backend outage (fetch/
// transport failure) from the legitimate "no region matches this
// countryCode" case. Before this fix, getRegion's outer try/catch collapsed
// BOTH into the same `null`, which the PDP (get-product.ts) reads as "no
// such region" and 404s on — so a real outage 404'd every PDP instead of
// hitting the (main)/error.tsx boundary. regionForCountry is the pure lookup
// extracted so the "no match -> null" path is testable without touching the
// network; the "outage -> throw" behavior comes from getRegion no longer
// wrapping listRegions() in a swallowing catch.
import { describe, it, expect, vi, beforeEach } from "vitest"

const listMock = vi.fn()
vi.mock("@lib/config", () => ({
  sdk: { store: { region: { list: (...args: any[]) => listMock(...args) } } },
}))

import { getRegion, regionForCountry } from "./regions"

function region(id: string, isoCodes: string[]) {
  return { id, countries: isoCodes.map((iso_2) => ({ iso_2 })) } as any
}

describe("regionForCountry — pure lookup", () => {
  it("returns the region matching countryCode", () => {
    const us = region("reg_us", ["us"])
    const ca = region("reg_ca", ["ca"])
    expect(regionForCountry([us, ca], "ca")).toBe(ca)
  })

  it("returns null when the list is non-empty but nothing matches (legitimate no-region case)", () => {
    const us = region("reg_us", ["us"])
    expect(regionForCountry([us], "de")).toBeNull()
  })

  it("returns null for an empty region list", () => {
    expect(regionForCountry([], "us")).toBeNull()
  })

  it("falls back to 'us' when countryCode is empty/falsy", () => {
    const us = region("reg_us", ["us"])
    expect(regionForCountry([us], "")).toBe(us)
  })
})

describe("getRegion — outage propagates, no-region returns null", () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  it("propagates (throws) on a genuine fetch/transport failure instead of returning null", async () => {
    // axios-style "request made, no response received" — the outage shape
    // medusaError converts into a thrown Error rather than a value.
    listMock.mockRejectedValueOnce({ request: {} })
    await expect(getRegion("us")).rejects.toThrow()
  })

  it("returns null (not a throw) on a successful fetch with no matching region", async () => {
    listMock.mockResolvedValueOnce({ regions: [region("reg_us", ["us"])] })
    const result = await getRegion("zz-no-such-code")
    expect(result).toBeNull()
  })

  it("still resolves the matching region on a successful fetch", async () => {
    const de = region("reg_de", ["de"])
    listMock.mockResolvedValueOnce({ regions: [de] })
    const result = await getRegion("de")
    expect(result).toBe(de)
  })
})
