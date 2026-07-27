export interface TireSizeResult {
  tireWidthMm: number | null
  aspectRatio: number | null
  constructionType: string | null
  rimDiameterIn: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  tirePrefix: string | null
  sizeToken: string | null
}

const NULL_RESULT: TireSizeResult = {
  tireWidthMm: null,
  aspectRatio: null,
  constructionType: null,
  rimDiameterIn: null,
  loadIndex: null,
  speedRating: null,
  plyRating: null,
  tirePrefix: null,
  sizeToken: null,
}

/**
 * Extract load index and speed rating from the text following a tire size.
 * Examples: "118S" -> { loadIndex: 118, speedRating: 'S' }
 *           "128R E" -> { loadIndex: 128, speedRating: 'R', plyRating: 'E' }
 *           "99W" -> { loadIndex: 99, speedRating: 'W' }
 */
function parseLoadSpeedPly(suffix: string): {
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
} {
  const trimmed = suffix.trim()

  // Match load index + speed rating anywhere in the suffix.
  // Pattern: 2-3 digits followed by a single letter (speed rating),
  // then optionally whitespace and a single uppercase letter (ply/load range).
  // The \b before digits ensures we don't match mid-word numeric substrings.
  //
  // The optional "/" between the digits and the speed letter covers the feed's
  // "123/Q" / "124/Q" / "121/Q" spelling of a service description. Without it
  // both loadIndex and speedRating silently came back null on rows whose size
  // parsed perfectly well.
  const match = trimmed.match(/(?:^|\s)(\d{2,3})\/?([A-Z])\b(?:\s+([A-Z])\b)?/)
  if (!match) {
    return { loadIndex: null, speedRating: null, plyRating: null }
  }

  const loadIndex = parseInt(match[1], 10)
  const speedRating = match[2]
  const plyRating = match[3] || null

  return { loadIndex, speedRating, plyRating }
}

/**
 * Parse tire dimensions from a PartDescription string.
 *
 * Handles three main formats:
 * 1. Metric:  "235/55ZR17", "305/45R22", "WDPEAK AT4W 305/45R22 118S"
 * 2. LT/inch: "LT37X12.50R18 128R E"
 * 3. Bias/ag: "12.4-24 8PR BKT TR171 TT"
 *
 * Returns null fields for any dimension that cannot be parsed.
 * Never throws -- unparseable descriptions produce all-null results with a warning.
 */
export function parseTireSize(description: string): TireSizeResult {
  if (!description || description.trim() === '') {
    console.warn('[tire-parse] Empty description, returning null fields')
    return { ...NULL_RESULT }
  }

  // The feed occasionally uses the UNICODE multiplication sign in an inch size
  // ("TRAIL GRAP 37×12.50R18LT"). Fold it to a plain X up front so every
  // pattern below sees one spelling instead of each needing [xX×].
  const desc = description.trim().replace(/×/g, "X")

  // --- Pattern 1: Metric format ---
  // Matches: 235/55ZR17, 305/45R22, 255/35ZR19, LT325/60T18
  // May appear after a prefix like "WDPEAK AT4W "
  // Optional prefix: (P|LT|ST)?
  //
  // T joins the construction class for sizes like "LT325/60T18": strictly the
  // T is an embedded speed symbol rather than a construction code, but every
  // other field (width/aspect/rim) parses correctly and recording
  // constructionType "T" is far better than discarding the whole size.
  // The trailing group covers "225/60R18XL" (load-range marker) and
  // "375/45R24LT" (service designation after the rim, the metric twin of what
  // Pattern 2 handles) -- both previously failed the \b after the rim digits.
  // The leading "-" alternative covers "MOTIVO 365-245/45R20", where the model
  // name is hyphenated straight onto the size.
  const metricMatch = desc.match(
    /(?:^|[\s-])(P|LT|ST)?(\d{2,3})\/(\d{2,3})(Z?)(R|B|D|T)(\d{2})(XL|LT|P|ST)?\b/
  )
  if (metricMatch) {
    // XL is a load range, not a service type -- it must not become tirePrefix
    // (classifyTireType reads that, and "XL" is neither P nor LT).
    const trailing = metricMatch[7] && metricMatch[7] !== "XL" ? metricMatch[7] : null
    const tirePrefix = metricMatch[1] || trailing
    const tireWidthMm = parseInt(metricMatch[2], 10)
    const aspectRatio = parseInt(metricMatch[3], 10)
    // Z is a speed rating modifier, construction type is R/B/D
    const constructionType = metricMatch[5]
    const rimDiameterIn = parseInt(metricMatch[6], 10)

    // Find load/speed/ply in the text after the size match
    const afterSize = desc.slice(metricMatch.index! + metricMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    // Rebuilt rather than echoed so the match's leading boundary ("-") and any
    // trailing XL/LT marker stay out of the token. Byte-identical to the old
    // `metricMatch[0].trim()` for every form that already parsed: a LEADING
    // prefix is still kept ("LT265/70R17"), unlike the inch branch below.
    const sizeToken = `${metricMatch[1] ?? ""}${tireWidthMm}/${aspectRatio}${metricMatch[4]}${constructionType}${rimDiameterIn}`

    return {
      tireWidthMm,
      aspectRatio,
      constructionType,
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken,
    }
  }

  // --- Pattern 1b: Dash-metric radial (size written with a dash instead of R) ---
  // Matches: 285/45-22, 285/45-22 114H  (WWW/AA-RR). The slash distinguishes it
  // from bias sizes (12.4-24, no slash). Canonicalized to radial "R".
  // The optional Z covers "MS932 XP+ 265/35Z-22 102W" -- the same speed
  // modifier Pattern 1 already tolerates, just on the dash spelling.
  const dashMetricMatch = desc.match(
    /(?:^|[\s])(P|LT|ST)?(\d{2,3})\/(\d{2,3})Z?-(\d{2})\b/
  )
  if (dashMetricMatch) {
    const tirePrefix = dashMetricMatch[1] || null
    const tireWidthMm = parseInt(dashMetricMatch[2], 10)
    const aspectRatio = parseInt(dashMetricMatch[3], 10)
    const rimDiameterIn = parseInt(dashMetricMatch[4], 10)

    const afterSize = desc.slice(desc.indexOf(dashMetricMatch[0]) + dashMetricMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    return {
      tireWidthMm,
      aspectRatio,
      constructionType: "R",
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken: `${tireWidthMm}/${aspectRatio}R${rimDiameterIn}`,
    }
  }

  // --- Pattern 2: LT/inch (flotation) format ---
  // Matches: LT37X12.50R18, P265X70R17, 33X12.50R15, and the TRAILING-service
  // spelling WheelPros actually ships for flotation lines: 33x12.50R20LT.
  //
  // The trailing group is why this pattern needed widening. The old regex ended
  // at `(\d{2})\b`, and with "LT" glued straight onto the rim digits there is no
  // word boundary after "20" -- so every "33x12.50R20LT" row fell through all
  // three patterns to the all-null result. That is not a cosmetic log warning:
  // a null sizeToken makes tireSizeLabel() fall back to the raw part number as
  // the variant axis, and the tire indexes with no canonical_size, no
  // rim/width/aspect facets and no fit_specs entry -- i.e. unfindable by size.
  //
  // sizeToken deliberately EXCLUDES a trailing service designation (-> "33x12.50R20")
  // but preserves a leading one (-> "LT37X12.50R18"), which keeps every
  // already-indexed leading-form row byte-identical. The designation is not lost
  // either way: it is captured into tirePrefix, which is what classifyTireType
  // reads for the light-truck/passenger facet.
  // The separator class also accepts "-": WheelPros writes the SAME flotation
  // size both ways ("35X12.50R20" and "LT35X12.50-20"), and the dash spelling
  // alone accounted for 190 of the 215 unparsed staged rows in the 2026-07-27
  // tires dry-run. Canonicalized to radial "R", mirroring Pattern 1b's
  // dash-metric precedent, so both spellings collapse to ONE facet value.
  const ltMatch = desc.match(
    /(?:^|[\s])(LT|P|ST)?(\d+\.?\d*)[xX](\d+\.?\d*)(R|B|D|T|-)(\d{2})(LT|P|ST)?\b/
  )
  if (ltMatch) {
    const trailingPrefix = ltMatch[6] || null
    const tirePrefix = ltMatch[1] || trailingPrefix
    const separator = ltMatch[4]
    // In inch format, the first number is overall diameter, not width in mm
    const constructionType = separator === "-" ? "R" : separator
    const rimDiameterIn = parseInt(ltMatch[5], 10)

    const afterSize = desc.slice(ltMatch.index! + ltMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    // sizeToken is rebuilt from the parts rather than echoed from the match,
    // so every spelling of one physical size lands on ONE canonical value:
    // the service designation is dropped (it survives in tirePrefix, which is
    // what classifyTireType reads) and the separator is normalized to R.
    // "LT35X12.50-20", "35X12.50R20LT" and "LT35X12.50R20" all become
    // "35X12.50R20". This DOES restate previously-indexed leading-prefix rows
    // -- deliberately: it is a one-time canonicalization that must land in the
    // same apply as the WB-115 dead-image cleanup, because doing it later
    // would rewrite the Size variant axis on rows that had already shipped.
    const sizeToken = `${ltMatch[2]}X${ltMatch[3]}${constructionType}${ltMatch[5]}`

    return {
      tireWidthMm: null,
      aspectRatio: null,
      constructionType,
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken,
    }
  }

  // --- Pattern 2b: slash-inch (drag / rock-crawler) format ---
  // Matches: 29.0/10.5R18, 18.5/39R17LT, 17/49-20LT, 19.5/54-20LT
  // Overall diameter / section width / rim, all in INCHES -- so it must never
  // be read as metric (a 29mm-wide tire), which is why it returns null
  // tireWidthMm/aspectRatio like Pattern 2 rather than filling them in.
  //
  // Ordering is load-bearing: this sits BELOW Patterns 1 and 1b so a genuine
  // metric size is always claimed by them first. The guard below is the
  // tiebreak for what reaches here: a real metric width is a 3-digit integer
  // (185-355), whereas these inch heights are 2 digits or carry a decimal.
  const slashInchMatch = desc.match(
    /(?:^|[\s])(LT|P|ST)?(\d+\.?\d*)\/(\d+\.?\d*)(R|B|D|-)(\d{2})(LT|P|ST)?\b/
  )
  if (slashInchMatch) {
    const height = slashInchMatch[2]
    const isInch = height.includes(".") || height.replace(/\D/g, "").length <= 2
    if (isInch) {
      const trailingPrefix = slashInchMatch[6] || null
      const tirePrefix = slashInchMatch[1] || trailingPrefix
      const separator = slashInchMatch[4]
      const constructionType = separator === "-" ? "R" : separator
      const rimDiameterIn = parseInt(slashInchMatch[5], 10)

      const afterSize = desc.slice(
        slashInchMatch.index! + slashInchMatch[0].length
      )
      const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

      return {
        tireWidthMm: null,
        aspectRatio: null,
        constructionType,
        rimDiameterIn,
        loadIndex,
        speedRating,
        plyRating,
        tirePrefix,
        sizeToken: `${height}/${slashInchMatch[3]}${constructionType}${slashInchMatch[5]}`,
      }
    }
  }

  // --- Pattern 3: Bias/agricultural format ---
  // Matches: 12.4-24 8PR, 11.2-26 8PR, and the X-separated spelling of the same
  // thing (8.3X20 6PR). Implement/ag tires carry no R/B/D construction letter,
  // so Pattern 2 can never anchor on them and the dash-only form left rows like
  // "8.3X20 6PR BKT TR 171 TT" unparsed. The separator is captured rather than
  // hardcoded so sizeToken echoes the feed's own spelling.
  //
  // Ordering note: this stays BELOW Pattern 2, and the mandatory `\s+\d+PR` tail
  // keeps it from poaching radial sizes -- a flotation row like "33X12.50R20LT"
  // has already returned above, and carries no "<n>PR" token to match here anyway.
  const biasMatch = desc.match(/(\d+\.?\d*)([-xX])(\d{2})\s+(\d+PR)\b/)
  if (biasMatch) {
    const rimDiameterIn = parseInt(biasMatch[3], 10)
    const plyRating = biasMatch[4]

    return {
      tireWidthMm: null,
      aspectRatio: null,
      constructionType: null,
      rimDiameterIn,
      loadIndex: null,
      speedRating: null,
      plyRating,
      tirePrefix: null,
      sizeToken: `${biasMatch[1]}${biasMatch[2]}${biasMatch[3]}`,
    }
  }

  // No pattern matched
  console.warn(
    `[tire-parse] Could not parse tire dimensions from description: "${description}"`
  )
  return { ...NULL_RESULT }
}
