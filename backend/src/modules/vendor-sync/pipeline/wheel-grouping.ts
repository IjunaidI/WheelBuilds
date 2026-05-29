import { WheelNormalizedRecord } from "../adapters/types"

export const WHEEL_OPTION_TITLES = {
  BOLT_PATTERN: "Bolt Pattern",
  DIAMETER: "Diameter",
  WIDTH: "Width",
  OFFSET: "Offset",
} as const

export interface AxisCollision {
  axisKey: string
  partNumbers: string[]
  // True when colliding SKUs differ on centerBore or loadRating. That
  // is the "you are missing an axis" signal: the rows ARE distinct in
  // reality, the current four-axis model just cannot tell them apart.
  hasHiddenDistinction: boolean
  hiddenFieldsDiffering: Array<"centerBoreMm" | "loadRatingLb">
}

/**
 * Slugify into a URL-safe handle.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Stringify a numeric option value with stable formatting. Integers
 * stay integers (20 not "20.0"); fractional values keep their useful
 * digits. The same float coming from any row in the group must produce
 * the same string or Medusa's option matching breaks.
 */
export function formatNumericOption(value: number): string {
  if (Number.isInteger(value)) return String(value)
  // Trim trailing zeros from a fixed representation (e.g. "8.50" -> "8.5").
  return value.toFixed(2).replace(/\.?0+$/, "")
}

/**
 * The 4-tuple that uniquely identifies a variant inside a group under
 * the current variant-axis model.
 */
export function variantAxisKey(record: WheelNormalizedRecord): string {
  return [
    record.boltPatternRaw,
    formatNumericOption(record.diameterIn),
    formatNumericOption(record.widthIn),
    formatNumericOption(record.offsetMm),
  ].join("|")
}

/**
 * Detect two or more variants whose four-axis tuple is identical.
 * Returns null when the group is collision-free; otherwise returns
 * info on the first collision found, including whether the colliding
 * SKUs differ on centerBoreMm or loadRatingLb (which would mean the
 * collision is real product diversity that needs a 5th axis).
 */
export function findAxisCollision(
  records: WheelNormalizedRecord[]
): AxisCollision | null {
  const byKey = new Map<string, WheelNormalizedRecord[]>()
  for (const r of records) {
    const k = variantAxisKey(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }

  for (const [axisKey, group] of byKey) {
    if (group.length < 2) continue

    const hiddenFieldsDiffering: AxisCollision["hiddenFieldsDiffering"] = []
    const centerBores = new Set(group.map((r) => r.centerBoreMm))
    if (centerBores.size > 1) hiddenFieldsDiffering.push("centerBoreMm")
    const loads = new Set(group.map((r) => r.loadRatingLb))
    if (loads.size > 1) hiddenFieldsDiffering.push("loadRatingLb")

    return {
      axisKey,
      partNumbers: group.map((r) => r.partNumber).sort(),
      hasHiddenDistinction: hiddenFieldsDiffering.length > 0,
      hiddenFieldsDiffering,
    }
  }

  return null
}

/**
 * Build the four Medusa product options for a wheel group. Each option
 * lists the UNION of distinct values across the variants in the group;
 * Medusa creates the option-value rows from this.
 */
export function buildProductOptions(
  records: WheelNormalizedRecord[]
): Array<{ title: string; values: string[] }> {
  const boltPatterns = new Set<string>()
  const diameters = new Set<string>()
  const widths = new Set<string>()
  const offsets = new Set<string>()

  for (const r of records) {
    boltPatterns.add(r.boltPatternRaw)
    diameters.add(formatNumericOption(r.diameterIn))
    widths.add(formatNumericOption(r.widthIn))
    offsets.add(formatNumericOption(r.offsetMm))
  }

  return [
    { title: WHEEL_OPTION_TITLES.BOLT_PATTERN, values: [...boltPatterns].sort() },
    {
      title: WHEEL_OPTION_TITLES.DIAMETER,
      values: [...diameters].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      ),
    },
    {
      title: WHEEL_OPTION_TITLES.WIDTH,
      values: [...widths].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      ),
    },
    {
      title: WHEEL_OPTION_TITLES.OFFSET,
      values: [...offsets].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      ),
    },
  ]
}

/**
 * Map a single wheel record to its variant `options` object. Keyed by
 * the option titles defined in WHEEL_OPTION_TITLES so the create input
 * matches what buildProductOptions emits.
 */
export function buildVariantOptions(
  record: WheelNormalizedRecord
): Record<string, string> {
  return {
    [WHEEL_OPTION_TITLES.BOLT_PATTERN]: record.boltPatternRaw,
    [WHEEL_OPTION_TITLES.DIAMETER]: formatNumericOption(record.diameterIn),
    [WHEEL_OPTION_TITLES.WIDTH]: formatNumericOption(record.widthIn),
    [WHEEL_OPTION_TITLES.OFFSET]: formatNumericOption(record.offsetMm),
  }
}

/**
 * Display title for a wheel product. For per-SKU fallback rows (no
 * DisplayStyleNo), the caller should use the record's `title` field
 * (the CSV PartDescription) instead.
 */
export function buildGroupTitle(record: WheelNormalizedRecord): string {
  if (!record.displayStyleNo) {
    return record.title
  }
  const parts = [record.brand, record.displayStyleNo]
  if (record.finish) parts.push(record.finish)
  return parts.join(" ")
}

/**
 * URL-safe handle for a wheel product.
 *
 *   grouped:    brand-displayStyleNo[-finish]   e.g. performance-replicas-126-gloss-black
 *   per-SKU:    brand-partNumber                e.g. dub-1pc-y305198543-2515
 *
 * Handles are derived from DisplayStyleNo, never the Style column, to
 * avoid the T-13 collision (Tuff T04, T07, T13 all surface "T-13" in
 * Style).
 */
export function buildGroupHandle(record: WheelNormalizedRecord): string {
  if (!record.displayStyleNo) {
    return `${slugify(record.brand)}-${slugify(record.partNumber)}`
  }
  const parts = [slugify(record.brand), slugify(record.displayStyleNo)]
  if (record.finish) parts.push(slugify(record.finish))
  return parts.filter(Boolean).join("-")
}

/**
 * Pick one record from the group whose product-level fields (title,
 * handle, image, weight basis) drive the parent Medusa product. By
 * default we use the lowest part_number lexicographically for a
 * deterministic choice. If multiple records in the group differ on
 * group-level fields, the caller decides whether to log a warning.
 */
export function pickGroupRepresentative(
  records: WheelNormalizedRecord[]
): WheelNormalizedRecord {
  const sorted = [...records].sort((a, b) =>
    a.partNumber.localeCompare(b.partNumber)
  )
  return sorted[0]
}
