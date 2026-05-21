import { createHash } from 'crypto'
import { NormalizedRecord } from '../adapters/types'

/**
 * Compute a SHA-256 content hash of a NormalizedRecord.
 * The hash is deterministic: keys are sorted, and runDateVendor is excluded
 * (it changes every feed publication and would invalidate every row).
 */
export function computeContentHash(record: NormalizedRecord): string {
  const base: Record<string, unknown> = {
    partNumber: record.partNumber,
    vendorCode: record.vendorCode,
    title: record.title,
    brand: record.brand,
    imageUrl: record.imageUrl,
    invOrderType: record.invOrderType,
    totalQoh: record.totalQoh,
    msrpUsd: record.msrpUsd,
    mapUsd: record.mapUsd,
    productType: record.productType,
    // runDateVendor intentionally excluded
    stockByWarehouse: sortObject(record.stockByWarehouse),
  }

  if (record.productType === 'wheel') {
    base.displayStyleNo = record.displayStyleNo
    base.finish = record.finish
    base.diameterIn = record.diameterIn
    base.widthIn = record.widthIn
    base.boltCount = record.boltCount
    base.boltCircleIn = record.boltCircleIn
    base.boltPatternRaw = record.boltPatternRaw
    base.offsetMm = record.offsetMm
    base.centerBoreMm = record.centerBoreMm
    base.loadRatingLb = record.loadRatingLb
    base.shippingWeightLb = record.shippingWeightLb
    base.style = record.style
  } else if (record.productType === 'tire') {
    base.manufacturerPartNumber = record.manufacturerPartNumber
    base.division = record.division
    base.tireWidthMm = record.tireWidthMm
    base.aspectRatio = record.aspectRatio
    base.constructionType = record.constructionType
    base.rimDiameterIn = record.rimDiameterIn
    base.loadIndex = record.loadIndex
    base.speedRating = record.speedRating
    base.plyRating = record.plyRating
    base.tirePrefix = record.tirePrefix
  }

  const canonical = JSON.stringify(base, Object.keys(base).sort())
  return createHash('sha256').update(canonical).digest('hex')
}

function sortObject(obj: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {}
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key]
  }
  return sorted
}
