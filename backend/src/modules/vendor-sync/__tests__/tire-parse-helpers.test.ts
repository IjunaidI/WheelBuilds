import { parseTireSize } from "../utils/tire-parse-helpers"

describe("parseTireSize dash-metric radial (WB-089 L8)", () => {
  it("parses 285/45-22 as radial 285/45R22 with load/speed", () => {
    const r = parseTireSize("ST5000 285/45-22 114H")
    expect(r.tireWidthMm).toBe(285)
    expect(r.aspectRatio).toBe(45)
    expect(r.rimDiameterIn).toBe(22)
    expect(r.constructionType).toBe("R")
    expect(r.sizeToken).toBe("285/45R22")
    expect(r.loadIndex).toBe(114)
    expect(r.speedRating).toBe("H")
  })
  it("leaves standard metric (with an R) unchanged", () => {
    expect(parseTireSize("305/45R22 118S").sizeToken).toBe("305/45R22")
  })
  it("does not mis-handle bias sizes that use a dash (12.4-24 8PR)", () => {
    expect(parseTireSize("12.4-24 8PR BKT TR171 TT").sizeToken).toBe("12.4-24")
  })
})
