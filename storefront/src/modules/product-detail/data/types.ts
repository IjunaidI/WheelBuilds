/**
 * Product Detail data types.
 *
 * Mirrors the shape of what a real Medusa product + variant + fitment join
 * will return. Keep these stable when wiring real data — every consumer in
 * `modules/product-detail/components/*` reads from them.
 *
 * The base `DiscoveryProduct` (price, finish, diameter, etc.) is reused from
 * the discovery module so the integration story stays unified.
 */

import { Finish } from "@modules/common/components/wheel"
import { DiscoveryProduct } from "@modules/discovery/data/types"

/** One offset (ET) option under a Diameter × Width combo. */
export type OffsetVariant = {
  /** ET in mm. Positive = inboard (tucked), lower = pushed out to the fender. */
  value: number
  /** Backspace, e.g. `5.65"`. */
  backspaceIn: string
  /** Lip depth (front-face to barrel rim), e.g. `0.85"`. */
  lipDepthIn?: string
  /** Hub-to-lock steering clearance, e.g. `5.2"`. */
  hubToLockIn?: string
  /** This offset's own price in cents. The hero shows this for the selected ET; falls back to the size-level price when absent. */
  priceCents?: number
  /** Medusa variant id for this exact size × offset. Drives the cart line item. */
  variantId: string
  /** Per-offset stock state — checked before add-to-cart so an out-of-stock ET hiding under an in-stock size cell can't be purchased. */
  availability: "in_stock" | "low_stock" | "out_of_stock"
  /** Center bore (mm) for this exact variant; null when the vendor omits it. */
  centerBoreMm: number | null
  /** Load rating (lb) for this exact variant; null when the vendor omits it. */
  loadRatingLb: number | null
}

/** A specific Diameter × Width combination available for this product. */
export type SizeOption = {
  /** Diameter in inches. */
  diameter: number
  /** Width in inches. */
  width: number
  /** Offset (mm) — the OEM / default pick. Equals `oemOffsetMm` if provided, else the only offset. */
  offsetMm: number
  /** All ET options available under this size, with per-offset spec detail. Falls back to a single entry derived from `offsetMm`. */
  offsetVariants?: OffsetVariant[]
  /** Raw bolt pattern (e.g. "5x114.3") this size is scoped to. Each SizeOption belongs to exactly one pattern; the picker filters sizes by the selected pattern. */
  boltPattern: string
  /** OEM-recommended ET for this size on the active vehicle. Selecting anything else flips to a CustomFit override. */
  oemOffsetMm?: number
  /** Per-wheel weight in pounds. */
  weightLb: number
  /** Stock state. `low_stock` shows a warning chip; `out_of_stock` disables the variant. */
  availability: "in_stock" | "low_stock" | "out_of_stock"
  /** Override price for this size, in cents. Falls back to product priceCents. */
  priceCentsOverride?: number
}

/** One finish a wheel is offered in, with its own image + size matrix. */
export type FinishOption = {
  /** Raw vendor finish label, e.g. "Matte Black". The selectable variant value. */
  raw: string
  /** Normalized bucket (black/silver/bronze) — drives the <Wheel> fallback color. */
  normalized: Finish
  /** This finish's product image (vendor CDN); null falls back to <Wheel>. */
  imageUrl: string | null
  /** Size matrix scoped to THIS finish's variants. */
  sizeOptions: SizeOption[]
}

/** A vehicle confirmed to fit this product. Drives the fitment list. */
export type FitmentEntry = {
  year: string
  make: string
  model: string
  trim?: string
  /** OEM bolt pattern for this vehicle — informational on the fitment row. */
  boltPattern?: string
  /** Notes (lug pattern conflict, requires hub adapter, etc.). */
  notes?: string
}

export type ProductDetail = DiscoveryProduct & {
  /** Marketing description, plain text. Rendered in the purchase panel. */
  description: string

  /** Long-form construction / engineering blurb shown in the Specs section. */
  spotlight?: string

  /** Per-spec values for the Specs grid. */
  specs: {
    /** Admin-set product metadata; null when absent (no vendor source for wheels). */
    construction: string | null
    weightLb: number
    loadRatingLb: number
    centerBoreMm: number
    hubBoreMm?: number
    /** Admin-set product metadata; null when absent. */
    countryOfOrigin: string | null
    /** Admin-set product metadata; null when absent. */
    warranty: string | null
    finishOptions: number
  }

  /** Finishes the product is offered in; the hero finish selector switches between these. */
  finishOptions: FinishOption[]

  /** Size matrix (Diameter × Width × Offset). */
  sizeOptions: SizeOption[]

  /** Bolt patterns the product supports. */
  boltPatternOptions: string[]

  /** Canonical bolt patterns ("{count}x{pcd_mm}") derived from boltPatternOptions — the fitment join key. */
  boltPatternsCanonical: string[]

  /** Vehicles confirmed to fit. Real source: a fitment join table per Phase 2.1. */
  fitment: FitmentEntry[]

  /** Other product handles to surface in the Related section. */
  relatedHandles: string[]
}

export const FINISH_LABELS: Record<Finish, string> = {
  black: "Gloss Black",
  bronze: "Satin Bronze",
  silver: "Brushed Silver",
}

export const FINISH_SWATCH: Record<Finish, string> = {
  black: "#1A1A1B",
  bronze: "#9C6A3F",
  silver: "#C8C8CB",
}
