import { NormalizedRecord } from "../adapters/types"

/**
 * Build product metadata from a NormalizedRecord.
 * Pure function -- no side effects.
 */
export function buildProductMetadata(
  normalized: NormalizedRecord
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    vendor_code: normalized.vendorCode,
    vendor_part_number: normalized.partNumber,
    vendor_map_usd: normalized.mapUsd,
    vendor_inv_order_type: normalized.invOrderType,
    product_type: normalized.productType,
  }

  if (normalized.productType === "wheel") {
    return {
      ...base,
      wheel_diameter_in: normalized.diameterIn,
      wheel_width_in: normalized.widthIn,
      bolt_count: normalized.boltCount,
      bolt_circle_in: normalized.boltCircleIn,
      bolt_pattern_raw: normalized.boltPatternRaw,
      offset_mm: normalized.offsetMm,
      center_bore_mm: normalized.centerBoreMm,
      load_rating_lb: normalized.loadRatingLb,
      finish: normalized.finish,
      style: normalized.style,
      display_style_no: normalized.displayStyleNo,
    }
  }

  return {
    ...base,
    manufacturer_part_number: normalized.manufacturerPartNumber,
    vendor_division: normalized.division,
    tire_width_mm: normalized.tireWidthMm,
    aspect_ratio: normalized.aspectRatio,
    construction_type: normalized.constructionType,
    rim_diameter_in: normalized.rimDiameterIn,
    load_index: normalized.loadIndex,
    speed_rating: normalized.speedRating,
    ply_rating: normalized.plyRating,
    tire_prefix: normalized.tirePrefix,
  }
}
