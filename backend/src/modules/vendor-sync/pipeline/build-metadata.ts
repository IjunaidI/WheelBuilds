import { NormalizedRecord } from "../adapters/types"

/**
 * Build PRODUCT-level metadata. Only fields that are constant across all
 * variants of a wheel group (brand, displayStyleNo, style, the group key
 * itself) belong here. NOTE: finish has moved to VARIANT metadata (each
 * finish is its own variant axis). Per-row fields like dimensions, prices,
 * bolt count, center bore, load rating, finish, and image_url go on the
 * VARIANT via buildVariantMetadata.
 *
 * Pure function -- no side effects.
 */
export function buildProductMetadata(
  normalized: NormalizedRecord
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    vendor_code: normalized.vendorCode,
    product_type: normalized.productType,
    group_key: normalized.groupKey,
    brand: normalized.brand,
  }

  if (normalized.productType === "wheel") {
    return {
      ...base,
      display_style_no: normalized.displayStyleNo,
      style: normalized.style,
    }
  }

  return {
    ...base,
    vendor_division: normalized.division,
    tire_prefix: normalized.tirePrefix,
  }
}

/**
 * Build VARIANT-level metadata. Captures the per-row fields that vary
 * inside a group (dimensions, bolt geometry, center bore, load rating)
 * plus the vendor identifiers that belong to a specific SKU.
 *
 * Pure function -- no side effects.
 */
export function buildVariantMetadata(
  normalized: NormalizedRecord
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    vendor_part_number: normalized.partNumber,
    vendor_map_usd: normalized.mapUsd,
    vendor_inv_order_type: normalized.invOrderType,
  }

  if (normalized.productType === "wheel") {
    return {
      ...base,
      finish: normalized.finish,
      image_url: normalized.imageUrl,
      wheel_diameter_in: normalized.diameterIn,
      wheel_width_in: normalized.widthIn,
      bolt_count: normalized.boltCount,
      bolt_circle_in: normalized.boltCircleIn,
      bolt_pattern_raw: normalized.boltPatternRaw,
      offset_mm: normalized.offsetMm,
      center_bore_mm: normalized.centerBoreMm,
      load_rating_lb: normalized.loadRatingLb,
    }
  }

  return {
    ...base,
    manufacturer_part_number: normalized.manufacturerPartNumber,
    tire_width_mm: normalized.tireWidthMm,
    aspect_ratio: normalized.aspectRatio,
    construction_type: normalized.constructionType,
    rim_diameter_in: normalized.rimDiameterIn,
    load_index: normalized.loadIndex,
    speed_rating: normalized.speedRating,
    ply_rating: normalized.plyRating,
  }
}
