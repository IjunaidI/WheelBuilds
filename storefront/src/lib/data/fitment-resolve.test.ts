import { describe, it, expect, vi } from "vitest"

// resolveFitmentForVehicle wraps getFitmentByVehicle — mock the data module so
// tests control resolve/reject without touching the network (same pattern as
// medusa-garage.test.ts).
vi.mock("./fitment", () => ({
  getFitmentByVehicle: vi.fn(),
}))

import * as fitmentApi from "./fitment"
import { resolveFitmentForVehicle } from "./fitment-resolve"

const mockedGetFitmentByVehicle = vi.mocked(fitmentApi.getFitmentByVehicle)

const sampleFitment = {
  status: "ok" as const,
  canonicalBoltPatterns: ["5x114.3"],
  hubBoreMm: 67.1,
  diameterWindow: null,
  widthWindow: null,
  offsetWindow: null,
  oemTireSizes: [],
  oemTires: [],
  source: { modificationSlug: "x", region: "usdm" },
}

describe("resolveFitmentForVehicle", () => {
  it("returns {kind: 'ok', fitment} on a successful lookup", async () => {
    mockedGetFitmentByVehicle.mockResolvedValueOnce(sampleFitment)
    const result = await resolveFitmentForVehicle("Ford", "F-150", "slug", "2022")
    expect(result).toEqual({ kind: "ok", fitment: sampleFitment })
  })

  it("returns {kind: 'unavailable'} when getFitmentByVehicle returns the 503 {error} shape", async () => {
    mockedGetFitmentByVehicle.mockResolvedValueOnce({ error: "unavailable" })
    const result = await resolveFitmentForVehicle("Ford", "F-150", "slug", "2022")
    expect(result).toEqual({ kind: "unavailable" })
  })

  it("returns {kind: 'failed'} when getFitmentByVehicle throws (non-503 failure)", async () => {
    mockedGetFitmentByVehicle.mockRejectedValueOnce(new Error("network blip"))
    const result = await resolveFitmentForVehicle("Ford", "F-150", "slug", "2022")
    expect(result).toEqual({ kind: "failed" })
  })

  it("passes make/model/modificationSlug/year/region through to getFitmentByVehicle unchanged", async () => {
    mockedGetFitmentByVehicle.mockResolvedValueOnce(sampleFitment)
    await resolveFitmentForVehicle("Ford", "F-150", "slug", "2022", "eudm")
    expect(mockedGetFitmentByVehicle).toHaveBeenCalledWith("Ford", "F-150", "slug", "2022", "eudm")
  })

  it("defaults region to usdm when omitted", async () => {
    mockedGetFitmentByVehicle.mockResolvedValueOnce(sampleFitment)
    await resolveFitmentForVehicle("Ford", "F-150", "slug", "2022")
    expect(mockedGetFitmentByVehicle).toHaveBeenCalledWith("Ford", "F-150", "slug", "2022", "usdm")
  })
})
