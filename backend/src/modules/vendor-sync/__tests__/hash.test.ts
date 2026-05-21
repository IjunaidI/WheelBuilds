import { computeContentHash } from '../utils/hash'
import { WheelNormalizedRecord, TireNormalizedRecord } from '../adapters/types'

function makeWheelRecord(overrides: Partial<WheelNormalizedRecord> = {}): WheelNormalizedRecord {
  return {
    productType: 'wheel',
    partNumber: '000000000001058059',
    vendorCode: 'wheelpros-wheels',
    title: 'NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK',
    brand: 'Teraflex',
    imageUrl: 'https://cdn.example.com/wheels/058-blk.jpg',
    invOrderType: 'ST',
    totalQoh: 20,
    msrpUsd: 369.99,
    mapUsd: 369.99,
    runDateVendor: new Date('2026-05-07T22:06:48'),
    stockByWarehouse: { '1001': 10, '1002': 5, '1003': 5 },
    displayStyleNo: '058',
    finish: 'Matte Black',
    diameterIn: 17,
    widthIn: 8.5,
    boltCount: 5,
    boltCircleIn: 5.0,
    offsetMm: -12,
    centerBoreMm: 71.5,
    loadRatingLb: 2250,
    shippingWeightLb: 32,
    style: 'NOMAD',
    ...overrides,
  }
}

function makeTireRecord(): TireNormalizedRecord {
  return {
    productType: 'tire',
    partNumber: '000000000001058059',
    vendorCode: 'wheelpros-wheels',
    title: 'NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK',
    brand: 'Teraflex',
    imageUrl: 'https://cdn.example.com/wheels/058-blk.jpg',
    invOrderType: 'ST',
    totalQoh: 20,
    msrpUsd: 369.99,
    mapUsd: 369.99,
    runDateVendor: new Date('2026-05-07T22:06:48'),
    stockByWarehouse: { '1001': 10, '1002': 5, '1003': 5 },
    manufacturerPartNumber: null,
    division: null,
    tireWidthMm: null,
    aspectRatio: null,
    constructionType: null,
    rimDiameterIn: null,
    loadIndex: null,
    speedRating: null,
    plyRating: null,
    tirePrefix: null,
  }
}

describe('computeContentHash', () => {
  it('produces the same hash for the same record across runs', () => {
    const record = makeWheelRecord()
    const hash1 = computeContentHash(record)
    const hash2 = computeContentHash(record)
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 hex
  })

  it('produces the same hash when stockByWarehouse keys are reordered', () => {
    const record1 = makeWheelRecord({
      stockByWarehouse: { '1001': 10, '1002': 5, '1003': 5 },
    })
    const record2 = makeWheelRecord({
      stockByWarehouse: { '1003': 5, '1001': 10, '1002': 5 },
    })
    expect(computeContentHash(record1)).toBe(computeContentHash(record2))
  })

  it('produces a different hash when msrpUsd changes by 1 cent', () => {
    const record1 = makeWheelRecord({ msrpUsd: 369.99 })
    const record2 = makeWheelRecord({ msrpUsd: 370.00 })
    expect(computeContentHash(record1)).not.toBe(computeContentHash(record2))
  })

  it('does NOT change hash when runDateVendor changes', () => {
    const record1 = makeWheelRecord({ runDateVendor: new Date('2026-05-07T22:06:48') })
    const record2 = makeWheelRecord({ runDateVendor: new Date('2026-05-08T10:00:00') })
    expect(computeContentHash(record1)).toBe(computeContentHash(record2))
  })

  it('produces different hashes for wheel vs tire with same base fields', () => {
    const wheelHash = computeContentHash(makeWheelRecord())
    const tireHash = computeContentHash(makeTireRecord())
    expect(wheelHash).not.toBe(tireHash)
  })
})
