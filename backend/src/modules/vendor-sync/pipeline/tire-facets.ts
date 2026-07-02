import { TireNormalizedRecord } from "../adapters/types"

/**
 * Size-only canonical facet value, e.g. "305/45R22". Uppercased; the "Z"
 * speed modifier (255/35ZR19) is removed so equivalent sizes match. Returns
 * null when the row carries no parseable size token.
 * Pure function -- no side effects.
 */
export function canonicalTireSize(record: TireNormalizedRecord): string | null {
  const token = record.sizeToken?.trim()
  if (!token) return null
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}

/**
 * The Size option value / variant axis: canonical size + service description
 * ("305/45R22 118S"). Falls back to the part number when the size is null so
 * the value is always non-empty and unique within a group.
 */
export function tireSizeLabel(record: TireNormalizedRecord): string {
  const size = canonicalTireSize(record)
  if (!size) return record.partNumber
  const service =
    record.loadIndex != null && record.speedRating
      ? ` ${record.loadIndex}${record.speedRating}`
      : ""
  return `${size}${service}`
}

/**
 * Coarse tire class for the discovery facet. Prefix wins; otherwise infer from
 * the parsed structure: metric (width+aspect) -> passenger; inch-format
 * (construction present, no width) -> light-truck; everything else -> other.
 */
export function classifyTireType(
  record: TireNormalizedRecord
): "passenger" | "light-truck" | "other" {
  const prefix = record.tirePrefix?.toUpperCase()
  if (prefix === "LT") return "light-truck"
  if (prefix === "P") return "passenger"
  if (prefix === "ST") return "other"
  if (record.tireWidthMm != null && record.aspectRatio != null) return "passenger"
  if (record.constructionType != null) return "light-truck"
  return "other"
}
