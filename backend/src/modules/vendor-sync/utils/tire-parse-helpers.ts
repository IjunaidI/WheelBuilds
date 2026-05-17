export interface TireSizeResult {
  tireWidthMm: number | null
  aspectRatio: number | null
  constructionType: string | null
  rimDiameterIn: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  tirePrefix: string | null
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
  const match = trimmed.match(/(?:^|\s)(\d{2,3})([A-Z])\b(?:\s+([A-Z])\b)?/)
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
    }
  }

  // --- Pattern 2: LT/inch format ---
  // Matches: LT37X12.50R18, P265X70R17, 33X12.50R15
  const ltMatch = desc.match(
    /(?:^|[\s])(LT|P|ST)?(\d+\.?\d*)[xX](\d+\.?\d*)(R|B|D)(\d{2})\b/
  )
  if (ltMatch) {
    const tirePrefix = ltMatch[1] || null
    // In inch format, the first number is overall diameter, not width in mm
    const constructionType = ltMatch[4]
    const rimDiameterIn = parseInt(ltMatch[5], 10)

    const afterSize = desc.slice(desc.indexOf(ltMatch[0]) + ltMatch[0].length)
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
    }
  }

  // --- Pattern 3: Bias/agricultural format ---
  // Matches: 12.4-24 8PR, 11.2-26 8PR
  const biasMatch = desc.match(/(\d+\.?\d*)-(\d{2})\s+(\d+PR)\b/)
  if (biasMatch) {
    const rimDiameterIn = parseInt(biasMatch[2], 10)
    const plyRating = biasMatch[3]

    return {
      tireWidthMm: null,
      aspectRatio: null,
      constructionType: null,
      rimDiameterIn,
      loadIndex: null,
      speedRating: null,
      plyRating,
      tirePrefix: null,
    }
  }

  // No pattern matched
  console.warn(
    `[tire-parse] Could not parse tire dimensions from description: "${description}"`
  )
  return { ...NULL_RESULT }
}
