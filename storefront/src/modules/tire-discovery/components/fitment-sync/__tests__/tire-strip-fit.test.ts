import { describe, it, expect } from "vitest"
import { TIRE_FIT_PARAM_KEYS } from "../tire-strip-fit"

describe("TIRE_FIT_PARAM_KEYS", () => {
  it("is the tire fit param set (fit + fitl + fits)", () => {
    expect(TIRE_FIT_PARAM_KEYS).toEqual(["fit", "fitl", "fits"])
  })
})
