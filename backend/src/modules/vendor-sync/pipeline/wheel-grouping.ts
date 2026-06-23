import { WheelNormalizedRecord } from "../adapters/types"

export const WHEEL_OPTION_TITLES = {
  BOLT_PATTERN: "Bolt Pattern",
  DIAMETER: "Diameter",
  WIDTH: "Width",
  OFFSET: "Offset",
  CENTER_BORE: "Center Bore",
  LOAD_RATING: "Load Rating",
} as const

/** Sentinel option value / axis-key segment for a null optional axis. */
export const OPTIONAL_AXIS_NONE = "—"

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

/** Format an optional numeric axis (center bore / load rating). */
export function formatOptionalAxis(value: number | null): string {
  return value == null ? OPTIONAL_AXIS_NONE : formatNumericOption(value)
}

/**
 * The 6-tuple that uniquely identifies a variant inside a group. Any
 * pairwise difference in any axis yields distinct variants; the only
 * residual collision is an exact duplicate (deduped in apply).
 */
export function variantAxisKey(record: WheelNormalizedRecord): string {
  return [
    record.boltPatternRaw,
    formatNumericOption(record.diameterIn),
    formatNumericOption(record.widthIn),
    formatNumericOption(record.offsetMm),
    formatOptionalAxis(record.centerBoreMm),
    formatOptionalAxis(record.loadRatingLb),
  ].join("|")
}

const toOptionalNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

/**
 * Reproduce variantAxisKey from a Medusa variant's metadata bag (used to
 * dedupe newly-added SKUs against variants already on a product).
 */
export function axisKeyFromMetadata(m: Record<string, unknown>): string {
  return [
    String(m.bolt_pattern_raw ?? ""),
    formatNumericOption(Number(m.wheel_diameter_in)),
    formatNumericOption(Number(m.wheel_width_in)),
    formatNumericOption(Number(m.offset_mm)),
    formatOptionalAxis(toOptionalNumber(m.center_bore_mm)),
    formatOptionalAxis(toOptionalNumber(m.load_rating_lb)),
  ].join("|")
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
