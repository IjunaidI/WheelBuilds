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
    expect(r.sizeToken).toBe("33X12.50R20")
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

  it("canonicalizes the LEADING-prefix form to the same bare size token", () => {
    // The service designation moves to tirePrefix so that every spelling of one
    // physical size collapses to ONE facet value (see the sizeToken rebuild in
    // Pattern 2). Everything else about the row is unchanged.
    const r = parseTireSize("LT37X12.50R18 128R E")
    expect(r.sizeToken).toBe("37X12.50R18")
    expect(r.tirePrefix).toBe("LT")
    expect(r.rimDiameterIn).toBe(18)
    expect(r.loadIndex).toBe(128)
    expect(r.speedRating).toBe("R")
    expect(r.plyRating).toBe("E")
  })

  it("collapses all three spellings of one size onto one token", () => {
    const a = parseTireSize("LT35X12.50R20 125Q").sizeToken
    const b = parseTireSize("BAJ BOSS MT 35X12.50R20LT 125Q").sizeToken
    const c = parseTireSize("BAJ BOSS MT LT35X12.50-20 125Q 34.7").sizeToken
    expect(a).toBe("35X12.50R20")
    expect(b).toBe("35X12.50R20")
    expect(c).toBe("35X12.50R20")
  })
})

describe("parseTireSize dash-separated inch (flotation) sizes", () => {
  // 190 of the 215 unparsed staged rows in the 2026-07-27 tires dry-run.
  it("parses a bare dash inch size", () => {
    const r = parseTireSize("GRIPPER MT 33X12.50-22 109Q 32.8")
    expect(r.sizeToken).toBe("33X12.50R22")
    expect(r.constructionType).toBe("R")
    expect(r.rimDiameterIn).toBe(22)
    expect(r.loadIndex).toBe(109)
    expect(r.speedRating).toBe("Q")
  })

  it("parses a dash inch size with a leading LT", () => {
    const r = parseTireSize("BAJ BOSS MT LT38X15.50-20 128Q 37.8")
    expect(r.sizeToken).toBe("38X15.50R20")
    expect(r.tirePrefix).toBe("LT")
    expect(r.rimDiameterIn).toBe(20)
  })

  it("parses a single-decimal width (35X9.5-24)", () => {
    const r = parseTireSize("MOTOSLAYER 35X9.5-24 79J 35")
    expect(r.sizeToken).toBe("35X9.5R24")
    expect(r.rimDiameterIn).toBe(24)
  })

  it("does NOT steal an X-separated bias size (still Pattern 3)", () => {
    const r = parseTireSize("8.3X20 6PR BKT TR 171 TT 3528320")
    expect(r.sizeToken).toBe("8.3X20")
    expect(r.plyRating).toBe("6PR")
  })
})

describe("parseTireSize slash-inch (drag / rock-crawler) sizes", () => {
  it("parses a decimal slash-inch radial", () => {
    const r = parseTireSize("PRO BRACKET RAD 29.0/10.5R18 28.9")
    expect(r.sizeToken).toBe("29.0/10.5R18")
    expect(r.rimDiameterIn).toBe(18)
    // Inch, not metric — these must never pollute the section-width facet.
    expect(r.tireWidthMm).toBeNull()
    expect(r.aspectRatio).toBeNull()
  })

  it("parses a slash-inch with a trailing LT", () => {
    const r = parseTireSize("BAJA BELTED II 18.5/39R17LT 125/P C 38.7")
    expect(r.sizeToken).toBe("18.5/39R17")
    expect(r.tirePrefix).toBe("LT")
    expect(r.rimDiameterIn).toBe(17)
  })

  it("parses a two-digit dash slash-inch (17/49-20LT)", () => {
    const r = parseTireSize("BAJA PRO XS 17/49-20LT 47.5")
    expect(r.sizeToken).toBe("17/49R20")
    expect(r.rimDiameterIn).toBe(20)
    expect(r.tireWidthMm).toBeNull()
  })

  it("NEVER steals a real metric size (the 3-digit-width guard)", () => {
    const r = parseTireSize("WDPEAK AT4W 305/45R22 118S")
    expect(r.tireWidthMm).toBe(305)
    expect(r.aspectRatio).toBe(45)
    expect(r.sizeToken).toBe("305/45R22")
  })

  it("NEVER steals a dash-metric size either", () => {
    const r = parseTireSize("ST5000 285/45-22 114H")
    expect(r.tireWidthMm).toBe(285)
    expect(r.sizeToken).toBe("285/45R22")
  })
})

describe("parseTireSize misc feed spellings", () => {
  it("folds the unicode multiplication sign", () => {
    const r = parseTireSize("TRAIL GRAP 37×12.50R18LT 128Q E 36.7")
    expect(r.sizeToken).toBe("37X12.50R18")
    expect(r.tirePrefix).toBe("LT")
  })

  it("accepts an embedded T speed symbol as the construction letter", () => {
    const r = parseTireSize("OPAT2 LT325/60T18 124/121S E10 33.3")
    expect(r.tireWidthMm).toBe(325)
    expect(r.aspectRatio).toBe(60)
    expect(r.rimDiameterIn).toBe(18)
  })

  it("accepts a Z modifier on the dash-metric form", () => {
    const r = parseTireSize("MS932 XP+ 265/35Z-22 102W 29.3")
    expect(r.tireWidthMm).toBe(265)
    expect(r.aspectRatio).toBe(35)
    expect(r.rimDiameterIn).toBe(22)
    expect(r.sizeToken).toBe("265/35R22")
  })
})

describe("parseTireSize load index separated from speed rating by a slash", () => {
  // Live feed rows: "123/Q", "124/Q", "121/Q". parseLoadSpeedPly required the
  // speed letter to sit immediately after the digits, so the load index and
  // speed rating were both silently dropped even once the size parsed.
  it("parses a slashed load/speed pair", () => {
    const r = parseTireSize("TRAILTEK RT 35x12.50R18LT 123/Q E 34.8")
    expect(r.sizeToken).toBe("35X12.50R18")
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
