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
  /** OEM-recommended ET for this size on the active vehicle. Selecting anything else flips to a CustomFit override. */
  oemOffsetMm?: number
  /** Per-wheel weight in pounds. */
  weightLb: number
  /** Stock state. `low_stock` shows a warning chip; `out_of_stock` disables the variant. */
  availability: "in_stock" | "low_stock" | "out_of_stock"
  /** Override price for this size, in cents. Falls back to product priceCents. */
  priceCentsOverride?: number
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
    construction: string // "Forged 6061-T6", "Cast aluminum", "Flow-formed"
    weightLb: number
    loadRatingLb: number
    centerBoreMm: number
    hubBoreMm?: number
    countryOfOrigin: string
    warranty: string
    finishOptions: number
  }

  /** Finishes the product is offered in. The hero variant picker switches between these. */
  finishOptions: Finish[]

  /** Size matrix (Diameter × Width × Offset). */
  sizeOptions: SizeOption[]

  /** Bolt patterns the product supports. */
  boltPatternOptions: string[]

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
