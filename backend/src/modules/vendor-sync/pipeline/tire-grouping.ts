import { TireNormalizedRecord } from "../adapters/types"
import { slugify } from "./wheel-grouping"
import { canonicalTireSize, tireSizeLabel } from "./tire-facets"

/** Tires have one meaningful variant axis: size. */
export const TIRE_OPTION_TITLES = {
  SIZE: "Size",
} as const

/**
 * Variant axis key = the size label (canonical size + service description), so
 * two rows of the same model that differ only by speed/load are DISTINCT
 * variants (never lost), and true exact duplicates collide and dedupe.
 */
export function tireVariantAxisKey(record: TireNormalizedRecord): string {
  return tireSizeLabel(record)
}

/**
 * Sort size labels the way the size string itself reads left-to-right --
 * width, then aspect ratio, then rim diameter -- falling back to a raw
 * label compare for anything that doesn't parse as a metric size.
 */
function compareSizeLabels(a: string, b: string): number {
  const width = (s: string): number => {
    const m = s.match(/(\d{2,3})\//)
    return m ? parseInt(m[1], 10) : 0
  }
  const aspect = (s: string): number => {
    const m = s.match(/\/(\d{2,3})[A-Z]/)
    return m ? parseInt(m[1], 10) : 0
  }
  const rim = (s: string): number => {
    const m = s.match(/R(\d{2})\b/) ?? s.match(/-(\d{2})\b/)
    return m ? parseInt(m[1], 10) : 0
  }
  return width(a) - width(b) || aspect(a) - aspect(b) || rim(a) - rim(b) || a.localeCompare(b)
}

export function buildTireProductOptions(
  records: TireNormalizedRecord[]
): Array<{ title: string; values: string[] }> {
  const values = new Set<string>()
  for (const r of records) values.add(tireSizeLabel(r))
  return [
    { title: TIRE_OPTION_TITLES.SIZE, values: [...values].sort(compareSizeLabels) },
  ]
}

export function buildTireVariantOptions(
  record: TireNormalizedRecord
): Record<string, string> {
  return { [TIRE_OPTION_TITLES.SIZE]: tireSizeLabel(record) }
}

/** Grouped title = brand + model; per-SKU fallback uses the raw description. */
export function buildTireGroupTitle(record: TireNormalizedRecord): string {
  if (!record.model) return record.title
  return `${record.brand} ${record.model}`
}

/** Grouped handle = brand-model; per-SKU fallback = brand-partNumber. */
export function buildTireGroupHandle(record: TireNormalizedRecord): string {
  if (!record.model) {
    return `${slugify(record.brand)}-${slugify(record.partNumber)}`
  }
  return [slugify(record.brand), slugify(record.model)].filter(Boolean).join("-")
}

function groupByAxisKey(
  records: TireNormalizedRecord[]
): Map<string, TireNormalizedRecord[]> {
  const byKey = new Map<string, TireNormalizedRecord[]>()
  for (const r of records) {
    const k = tireVariantAxisKey(r)
    const list = byKey.get(k) ?? []
    list.push(r)
    byKey.set(k, list)
  }
  return byKey
}

export function findTireExactDuplicates(
  records: TireNormalizedRecord[]
): TireNormalizedRecord[][] {
  return [...groupByAxisKey(records).values()].filter((g) => g.length > 1)
}

function pickSurvivor(dupes: TireNormalizedRecord[]): TireNormalizedRecord {
  return [...dupes].sort((a, b) => {
    const aStock = a.totalQoh > 0 ? 0 : 1
    const bStock = b.totalQoh > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return a.partNumber.localeCompare(b.partNumber)
  })[0]
}

export function dedupeTireExactDuplicates(records: TireNormalizedRecord[]): {
  survivors: TireNormalizedRecord[]
  dropped: TireNormalizedRecord[]
} {
  const survivors: TireNormalizedRecord[] = []
  const dropped: TireNormalizedRecord[] = []
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

/** Canonical size for a variant, used by the search facet. */
export { canonicalTireSize }
