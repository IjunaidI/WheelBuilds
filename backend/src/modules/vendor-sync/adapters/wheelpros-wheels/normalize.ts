import { ParsedRow, WheelNormalizedRecord } from '../types'
import {
  parseSize,
  parseBoltPattern,
  parseVendorDate,
  parsePrice,
  parseOptionalNumber,
} from '../../utils/parse-helpers'
import { wheelRawRowSchema } from './schema'
import { computeWheelGroupKey } from './group-key'

const VENDOR_CODE = 'wheelpros-wheels'

/**
 * Normalize a parsed CSV row into a WheelNormalizedRecord.
 */
export function normalizeWheelRow(row: ParsedRow): WheelNormalizedRecord {
  const raw = row.raw

  // Validate required fields
  wheelRawRowSchema.parse(raw)

  const { diameterIn, widthIn } = parseSize(raw['Size'])
  const boltResult = parseBoltPattern(raw['BoltPattern'])

  const stockByWarehouse: Record<string, number> = {}
  let warehouseSum = 0
  for (const wh of row.warehouseColumns) {
    const val = parseInt(raw[wh] || '0', 10)
    if (!isNaN(val) && val > 0) {
      stockByWarehouse[wh] = val
      warehouseSum += val
    }
  }

  const totalQoh = parseInt(raw['TotalQOH'] || '0', 10) || 0
  if (totalQoh !== warehouseSum && warehouseSum > 0) {
    // Log warning: TotalQOH mismatch. Trust per-warehouse sum.
    console.warn(
      `[${VENDOR_CODE}] TotalQOH mismatch for ${row.partNumber}: ` +
      `header says ${totalQoh}, warehouse sum is ${warehouseSum}. Trusting per-warehouse.`
    )
  }

  const imageUrl = raw['ImageURL']?.trim() || null
  const displayStyleNo = raw['DisplayStyleNo']?.trim() || null
  const finish = raw['Finish']?.trim() || null
  const brand = raw['Brand']

  return {
    productType: 'wheel',
    partNumber: row.partNumber,
    vendorCode: VENDOR_CODE,
    title: raw['PartDescription'],
    brand,
    imageUrl,
    invOrderType: raw['InvOrderType'],
    totalQoh: warehouseSum > 0 ? warehouseSum : totalQoh,
    msrpUsd: parsePrice(raw['MSRP_USD']),
    mapUsd: parsePrice(raw['MAP_USD']),
    runDateVendor: parseVendorDate(raw['RunDate']),
    stockByWarehouse,
    groupKey: computeWheelGroupKey({
      brand,
      displayStyleNo,
      finish,
      partNumber: row.partNumber,
    }),
    displayStyleNo,
    finish,
    diameterIn,
    widthIn,
    boltCount: boltResult?.boltCount ?? null,
    boltCircleIn: boltResult?.boltCircleIn ?? null,
    boltPatternRaw: raw['BoltPattern'],
    offsetMm: parseFloat(raw['Offset']) || 0,
    centerBoreMm: parseOptionalNumber(raw['CenterBore'] || ''),
    loadRatingLb: parseOptionalNumber(raw['LoadRating'] || ''),
    shippingWeightLb: parseOptionalNumber(raw['ShippingWeight'] || ''),
    style: raw['Style']?.trim() || null,
  }
}
