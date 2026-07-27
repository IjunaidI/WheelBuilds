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

  const desc = description.trim()

  // --- Pattern 1: Metric format ---
  // Matches: 235/55ZR17, 305/45R22, 255/35ZR19
  // May appear after a prefix like "WDPEAK AT4W "
  // Optional prefix: (P|LT|ST)?
  const metricMatch = desc.match(
    /(?:^|[\s])(P|LT|ST)?(\d{2,3})\/(\d{2,3})(Z?)(R|B|D)(\d{2})\b/
  )
  if (metricMatch) {
    const tirePrefix = metricMatch[1] || null
    const tireWidthMm = parseInt(metricMatch[2], 10)
    const aspectRatio = parseInt(metricMatch[3], 10)
    // Z is a speed rating modifier, construction type is R/B/D
    const constructionType = metricMatch[5]
    const rimDiameterIn = parseInt(metricMatch[6], 10)

    // Find load/speed/ply in the text after the size match
    const afterSize = desc.slice(desc.indexOf(metricMatch[0]) + metricMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    return {
      tireWidthMm,
      aspectRatio,
      constructionType,
      rimDiameterIn,
      loadIndex,
      speedRating,
      plyRating,
      tirePrefix,
      sizeToken: metricMatch[0].trim(),
    }
  }

  // --- Pattern 1b: Dash-metric radial (size written with a dash instead of R) ---
  // Matches: 285/45-22, 285/45-22 114H  (WWW/AA-RR). The slash distinguishes it
  // from bias sizes (12.4-24, no slash). Canonicalized to radial "R".
  const dashMetricMatch = desc.match(
    /(?:^|[\s])(P|LT|ST)?(\d{2,3})\/(\d{2,3})-(\d{2})\b/
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
  const ltMatch = desc.match(
    /(?:^|[\s])(LT|P|ST)?(\d+\.?\d*)[xX](\d+\.?\d*)(R|B|D)(\d{2})(LT|P|ST)?\b/
  )
  if (ltMatch) {
    const trailingPrefix = ltMatch[6] || null
    const tirePrefix = ltMatch[1] || trailingPrefix
    // In inch format, the first number is overall diameter, not width in mm
    const constructionType = ltMatch[4]
    const rimDiameterIn = parseInt(ltMatch[5], 10)

    const afterSize = desc.slice(ltMatch.index! + ltMatch[0].length)
    const { loadIndex, speedRating, plyRating } = parseLoadSpeedPly(afterSize)

    const matched = ltMatch[0].trim()
    const sizeToken = trailingPrefix
      ? matched.slice(0, matched.length - trailingPrefix.length)
      : matched

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
