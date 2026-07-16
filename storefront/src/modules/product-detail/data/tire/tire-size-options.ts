import { num, availabilityOf } from "../group-sizes"
import { LOW_STOCK_THRESHOLD } from "../pdp-config"

export type TireAvailability = "in_stock" | "low_stock" | "out_of_stock"

export type TireSizeOption = {
  sizeLabel: string
  canonicalSize: string
  rimDiameterIn: number
  sectionWidthMm: number | null
  aspectRatio: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  constructionType: string | null
  variantId: string
  /** Real vendor part number for this size's variant (WB-098) — Medusa's actual `sku` column. `undefined` when absent; never the internal `variantId` used as a stand-in. */
  sku?: string
  priceCents: number
  availability: TireAvailability
  /** Real on-hand quantity for this size's variant (WB-090 P2/P18) — drives the purchase panel's qty stepper cap/default and the "Only N left" copy. */
  quantity: number
}

const optNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null
const optStr = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null

/** Map a tire product's Medusa variants → sorted TireSizeOption[] (rim→width→aspect). Pure. */
export function buildTireSizeOptions(variants: any[]): TireSizeOption[] {
  const opts = (variants ?? []).map((v): TireSizeOption => {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    return {
      sizeLabel: optStr(m.size_label) ?? String(v.id ?? ""),
      canonicalSize: optStr(m.canonical_size) ?? "",
      rimDiameterIn: num(m.rim_diameter_in),
      sectionWidthMm: optNum(m.tire_width_mm),
      aspectRatio: optNum(m.aspect_ratio),
      loadIndex: optNum(m.load_index),
      speedRating: optStr(m.speed_rating),
      plyRating: optStr(m.ply_rating),
      constructionType: optStr(m.construction_type),
      variantId: String(v.id ?? ""),
      sku: optStr(v.sku) ?? undefined,
      priceCents: Math.round(num((v.calculated_price as any)?.calculated_amount) * 100),
      availability: availabilityOf(num(v.inventory_quantity), LOW_STOCK_THRESHOLD),
      quantity: num(v.inventory_quantity),
    }
  })
  return opts.sort(
    (a, b) =>
      a.rimDiameterIn - b.rimDiameterIn ||
      (a.sectionWidthMm ?? 0) - (b.sectionWidthMm ?? 0) ||
      (a.aspectRatio ?? 0) - (b.aspectRatio ?? 0) ||
      a.sizeLabel.localeCompare(b.sizeLabel)
  )
}

export function sizesForRim(opts: TireSizeOption[], rim: number): TireSizeOption[] {
  return opts.filter((o) => o.rimDiameterIn === rim)
}

/** First in-stock (not out_of_stock) size, else the first. */
export function pickDefaultTireSize(opts: TireSizeOption[]): TireSizeOption | undefined {
  return opts.find((o) => o.availability !== "out_of_stock") ?? opts[0]
}
