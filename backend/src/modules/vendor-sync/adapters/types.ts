export interface VendorFeedDescriptor {
  vendorCode: string
  archiveKey: string
  sourceFilename: string
  byteLength: number
  fetchedAt: Date
}

export interface ParsedRow {
  partNumber: string
  raw: Record<string, string>
  warehouseColumns: string[]
}

export interface NormalizedRecordBase {
  partNumber: string
  vendorCode: string
  title: string
  brand: string
  imageUrl: string | null
  invOrderType: string
  totalQoh: number
  msrpUsd: number
  mapUsd: number
  runDateVendor: Date
  stockByWarehouse: Record<string, number>
  // Key that buckets rows into the same Medusa product. Multiple rows
  // sharing a groupKey become one product with N variants. Per-record-type
  // derivation rules: wheels in adapters/wheelpros-wheels/group-key.ts;
  // tires fall back to partNumber until a tire grouping rule is defined.
  groupKey: string
}

export interface WheelNormalizedRecord extends NormalizedRecordBase {
  productType: 'wheel'
  displayStyleNo: string | null
  finish: string | null
  diameterIn: number
  widthIn: number
  boltCount: number | null
  boltCircleIn: number | null
  boltPatternRaw: string
  offsetMm: number
  centerBoreMm: number | null
  loadRatingLb: number | null
  shippingWeightLb: number | null
  style: string | null
}

export interface TireNormalizedRecord extends NormalizedRecordBase {
  productType: 'tire'
  manufacturerPartNumber: string | null
  division: string | null
  tireWidthMm: number | null
  aspectRatio: number | null
  constructionType: string | null
  rimDiameterIn: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  tirePrefix: string | null
}

export type NormalizedRecord = WheelNormalizedRecord | TireNormalizedRecord

export interface VendorAdapter {
  readonly vendorCode: string
  fetch(): Promise<VendorFeedDescriptor>
  parse(descriptor: VendorFeedDescriptor): AsyncIterable<ParsedRow>
  normalize(row: ParsedRow): NormalizedRecord
  submitPurchaseOrder(input: unknown): Promise<never>
}
