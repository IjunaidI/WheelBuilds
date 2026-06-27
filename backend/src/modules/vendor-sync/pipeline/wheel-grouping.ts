import { WheelNormalizedRecord } from "../adapters/types"

/**
 * The seven wheel variant axes. ALL seven options are emitted on every wheel
 * product, even single-value ones — Medusa cannot add a new option to an
 * existing product (only new values), so always-7 keeps the incremental
 * add path safe. Single-value Center Bore / Load Rating / Finish options are
 * admin-only noise; the PDP hides single-value selectors. See WB-051 / WB-059 /
 * docs/reference/vendor-sync-implementation.md.
 */
export const WHEEL_OPTION_TITLES = {
  BOLT_PATTERN: "Bolt Pattern",
  DIAMETER: "Diameter",
  WIDTH: "Width",
  OFFSET: "Offset",
  CENTER_BORE: "Center Bore",
  LOAD_RATING: "Load Rating",
  FINISH: "Finish",
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

/** Format the finish axis value: raw trimmed label, blank → sentinel. */
export function formatFinish(finish: string | null): string {
  const f = finish?.trim()
  return f ? f : OPTIONAL_AXIS_NONE
}

/**
 * The 7-tuple that uniquely identifies a variant inside a group. Any
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
    formatFinish(record.finish),
  ].join("|")
}

// Coerce a metadata value to a finite number or null. Accepts numeric
// strings too, mirroring the Number() coercion the mandatory axes use, so
// axisKeyFromMetadata stays byte-identical to variantAxisKey even if a
// metadata round-trip ever yields stringified numbers.
const toOptionalNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

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
    formatFinish(typeof m.finish === "string" ? m.finish : null),
  ].join("|")
}

/**
 * Build the seven Medusa product options for a wheel group. Each option
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
  const centerBores = new Set<string>()
  const loadRatings = new Set<string>()
  const finishes = new Set<string>()

  for (const r of records) {
    boltPatterns.add(r.boltPatternRaw)
    diameters.add(formatNumericOption(r.diameterIn))
    widths.add(formatNumericOption(r.widthIn))
    offsets.add(formatNumericOption(r.offsetMm))
    centerBores.add(formatOptionalAxis(r.centerBoreMm))
    loadRatings.add(formatOptionalAxis(r.loadRatingLb))
    finishes.add(formatFinish(r.finish))
  }

  const numericSort = (a: string, b: string) => parseFloat(a) - parseFloat(b)
  return [
    { title: WHEEL_OPTION_TITLES.BOLT_PATTERN, values: [...boltPatterns].sort() },
    { title: WHEEL_OPTION_TITLES.DIAMETER, values: [...diameters].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.WIDTH, values: [...widths].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.OFFSET, values: [...offsets].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.CENTER_BORE, values: [...centerBores].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.LOAD_RATING, values: [...loadRatings].sort(numericSort) },
    { title: WHEEL_OPTION_TITLES.FINISH, values: [...finishes].sort() },
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
    [WHEEL_OPTION_TITLES.CENTER_BORE]: formatOptionalAxis(record.centerBoreMm),
    [WHEEL_OPTION_TITLES.LOAD_RATING]: formatOptionalAxis(record.loadRatingLb),
    [WHEEL_OPTION_TITLES.FINISH]: formatFinish(record.finish),
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
  return [record.brand, record.displayStyleNo].join(" ")
}

/**
 * URL-safe handle for a wheel product.
 *
 *   grouped:    brand-displayStyleNo   e.g. performance-replicas-126
 *   per-SKU:    brand-partNumber       e.g. dub-1pc-y305198543-2515
 *
 * Handles are derived from DisplayStyleNo, never the Style column, to
 * avoid the T-13 collision (Tuff T04, T07, T13 all surface "T-13" in
 * Style). Finish is a variant axis, not part of the handle.
 */
export function buildGroupHandle(record: WheelNormalizedRecord): string {
  if (!record.displayStyleNo) {
    return `${slugify(record.brand)}-${slugify(record.partNumber)}`
  }
  return [slugify(record.brand), slugify(record.displayStyleNo)].filter(Boolean).join("-")
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

function groupByAxisKey(
  records: WheelNormalizedRecord[]
): Map<string, WheelNormalizedRecord[]> {
  const byKey = new Map<string, WheelNormalizedRecord[]>()
  for (const r of records) {
    const k = variantAxisKey(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  return byKey
}

/** Sets of records that share a 7-tuple (i.e. exact duplicates). */
export function findExactDuplicates(
  records: WheelNormalizedRecord[]
): WheelNormalizedRecord[][] {
  return [...groupByAxisKey(records).values()].filter((g) => g.length > 1)
}

/** The one survivor of an exact-duplicate set: in-stock first, then lowest part number. */
function pickSurvivor(dupes: WheelNormalizedRecord[]): WheelNormalizedRecord {
  return [...dupes].sort((a, b) => {
    const aStock = a.totalQoh > 0 ? 0 : 1
    const bStock = b.totalQoh > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return a.partNumber.localeCompare(b.partNumber)
  })[0]
}

/**
 * Collapse exact duplicates (identical 7-tuple) to one survivor each.
 * Center-bore- / load-rating-distinct rows are NOT duplicates and pass through.
 */
export function dedupeExactDuplicates(records: WheelNormalizedRecord[]): {
  survivors: WheelNormalizedRecord[]
  dropped: WheelNormalizedRecord[]
} {
  const survivors: WheelNormalizedRecord[] = []
  const dropped: WheelNormalizedRecord[] = []
  for (const group of groupByAxisKey(records).values()) {
    if (group.length === 1) {
      survivors.push(group[0])
      continue
    }
    const keep = pickSurvivor(group)
    survivors.push(keep)
    for (const r of group) if (r !== keep) dropped.push(r)
  }
  return { survivors, dropped }
}

/**
 * Filter newly-added records against the 7-tuples already on a product
 * (and against each other), so an exact duplicate is never created as a
 * second variant with the same option tuple.
 */
export function dedupeAddedAgainstExisting(
  records: WheelNormalizedRecord[],
  existingAxisKeys: Set<string>
): { toCreate: WheelNormalizedRecord[]; dropped: WheelNormalizedRecord[] } {
  const seen = new Set(existingAxisKeys)
  const toCreate: WheelNormalizedRecord[] = []
  const dropped: WheelNormalizedRecord[] = []
  for (const r of records) {
    const k = variantAxisKey(r)
    if (seen.has(k)) {
      dropped.push(r)
      continue
    }
    seen.add(k)
    toCreate.push(r)
  }
  return { toCreate, dropped }
}
