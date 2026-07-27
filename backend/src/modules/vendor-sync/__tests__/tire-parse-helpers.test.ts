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

describe("parseTireSize flotation sizes with a TRAILING service prefix", () => {
  // Live feed rows (2026-07-27 sync log) that produced
  // "[tire-parse] Could not parse tire dimensions". WheelPros writes flotation
  // LT sizes with the service designation AFTER the rim diameter
  // ("33x12.50R20LT"), not before it. Pattern 2 only ever accepted the leading
  // form, and its `\b` after the rim digits could not match with "LT" glued on,
  // so every one of these fell through to the all-null result: no sizeToken ->
  // tireSizeLabel() falls back to the raw part number as the variant axis and
  // the tire indexes with no size facet at all.
  it("parses a trailing-LT flotation size", () => {
    const r = parseTireSize("TRAILTEK RT 33x12.50R20LT 119Q F 32.8")
    expect(r.sizeToken).toBe("33x12.50R20")
    expect(r.rimDiameterIn).toBe(20)
    expect(r.constructionType).toBe("R")
    expect(r.tirePrefix).toBe("LT")
    expect(r.loadIndex).toBe(119)
    expect(r.speedRating).toBe("Q")
    expect(r.plyRating).toBe("F")
  })

  it("parses an uppercase-X trailing-LT flotation size", () => {
    const r = parseTireSize("PATAG ATR 33X12.50R20LT 114Q E 32.5")
    expect(r.sizeToken).toBe("33X12.50R20")
    expect(r.rimDiameterIn).toBe(20)
    expect(r.tirePrefix).toBe("LT")
    expect(r.loadIndex).toBe(114)
    expect(r.speedRating).toBe("Q")
  })

  it("keeps the LEADING-prefix form byte-identical (no regression)", () => {
    const r = parseTireSize("LT37X12.50R18 128R E")
    expect(r.sizeToken).toBe("LT37X12.50R18")
    expect(r.tirePrefix).toBe("LT")
    expect(r.rimDiameterIn).toBe(18)
    expect(r.loadIndex).toBe(128)
    expect(r.speedRating).toBe("R")
    expect(r.plyRating).toBe("E")
  })
})

describe("parseTireSize load index separated from speed rating by a slash", () => {
  // Live feed rows: "123/Q", "124/Q", "121/Q". parseLoadSpeedPly required the
  // speed letter to sit immediately after the digits, so the load index and
  // speed rating were both silently dropped even once the size parsed.
  it("parses a slashed load/speed pair", () => {
    const r = parseTireSize("TRAILTEK RT 35x12.50R18LT 123/Q E 34.8")
    expect(r.sizeToken).toBe("35x12.50R18")
    expect(r.loadIndex).toBe(123)
    expect(r.speedRating).toBe("Q")
    expect(r.plyRating).toBe("E")
  })

  it("still parses an unslashed load/speed pair", () => {
    const r = parseTireSize("WDPEAK AT4W 305/45R22 118S")
    expect(r.loadIndex).toBe(118)
    expect(r.speedRating).toBe("S")
  })
})

describe("parseTireSize bias/agricultural sizes written with an X", () => {
  // Live feed row "8.3X20 6PR BKT TR 171 TT 3528320" -- an implement tire whose
  // section-width x rim size uses X instead of the dash Pattern 3 expected, and
  // which carries no R/B/D construction letter for Pattern 2 to anchor on.
  it("parses an X-separated bias size", () => {
    const r = parseTireSize("8.3X20 6PR BKT TR 171 TT 3528320")
    expect(r.sizeToken).toBe("8.3X20")
    expect(r.rimDiameterIn).toBe(20)
    expect(r.plyRating).toBe("6PR")
  })

  it("still parses the dash-separated bias form", () => {
    const r = parseTireSize("12.4-24 8PR BKT TR171 TT")
    expect(r.sizeToken).toBe("12.4-24")
    expect(r.rimDiameterIn).toBe(24)
    expect(r.plyRating).toBe("8PR")
  })
})
