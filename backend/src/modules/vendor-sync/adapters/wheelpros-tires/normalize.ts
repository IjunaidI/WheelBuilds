import { ParsedRow, TireNormalizedRecord } from '../types'
import { parseVendorDate, parsePrice } from '../../utils/parse-helpers'
import { parseTireSize } from '../../utils/tire-parse-helpers'
import { tireRawRowSchema } from './schema'

const VENDOR_CODE = 'wheelpros-tires'

/**
 * Normalize a parsed CSV row into a TireNormalizedRecord.
 */
export function normalizeTireRow(row: ParsedRow): TireNormalizedRecord {
  const raw = row.raw

  // Validate required fields
  tireRawRowSchema.parse(raw)

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
    console.warn(
      `[${VENDOR_CODE}] TotalQOH mismatch for ${row.partNumber}: ` +
      `header says ${totalQoh}, warehouse sum is ${warehouseSum}. Trusting per-warehouse.`
    )
  }

  const imageUrl = raw['ImageURL']?.trim() || null
  const manufacturerPartNumber = raw['ManufacturerPartNumber']?.trim() || null
  const division = raw['Division']?.trim() || null

  const tireSize = parseTireSize(raw['PartDescription'])

  return {
    productType: 'tire',
    partNumber: row.partNumber,
    vendorCode: VENDOR_CODE,
    title: raw['PartDescription'],
    brand: raw['Brand'],
    imageUrl,
    invOrderType: raw['InvOrderType'] as 'ST' | 'N2' | 'SO',
    totalQoh: warehouseSum > 0 ? warehouseSum : totalQoh,
    msrpUsd: parsePrice(raw['MSRP_USD']),
    mapUsd: parsePrice(raw['MAP_USD']),
    runDateVendor: parseVendorDate(raw['RunDate']),
    stockByWarehouse,
    // Tires keep one-product-per-row until a tire grouping rule is defined.
    // sku: prefix mirrors the wheel fallback so logs read consistently.
    groupKey: `sku:${row.partNumber}`,
    manufacturerPartNumber,
    division,
    ...tireSize,
  }
}
