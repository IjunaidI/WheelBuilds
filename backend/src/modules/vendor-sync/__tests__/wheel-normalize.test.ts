import {
  parseSize,
  parseBoltPattern,
  parsePrice,
  parseVendorDate,
  parseOptionalNumber,
} from '../utils/parse-helpers'
import { normalizeWheelRow } from '../adapters/wheelpros-wheels/normalize'
import { ParsedRow } from '../adapters/types'

describe('parseSize', () => {
  it('parses "17X8.5" correctly', () => {
    const result = parseSize('17X8.5')
    expect(result).toEqual({ diameterIn: 17, widthIn: 8.5 })
  })

  it('parses "18X9.0" correctly', () => {
    const result = parseSize('18X9.0')
    expect(result).toEqual({ diameterIn: 18, widthIn: 9.0 })
  })

  it('is case insensitive', () => {
    const result = parseSize('17x8.5')
    expect(result).toEqual({ diameterIn: 17, widthIn: 8.5 })
  })
})

describe('parseBoltPattern', () => {
  it('parses "5X5.0" correctly', () => {
    const result = parseBoltPattern('5X5.0')
    expect(result).toEqual({ boltCount: 5, boltCircleIn: 5.0 })
  })

  it('parses "6X5.5" correctly', () => {
    const result = parseBoltPattern('6X5.5')
    expect(result).toEqual({ boltCount: 6, boltCircleIn: 5.5 })
  })
})

describe('parsePrice', () => {
  it('parses "369.99" correctly', () => {
    expect(parsePrice('369.99')).toBe(369.99)
  })

  it('parses "0.00" correctly', () => {
    expect(parsePrice('0.00')).toBe(0)
  })
})

describe('parseOptionalNumber', () => {
  it('returns null for empty string', () => {
    expect(parseOptionalNumber('')).toBeNull()
  })

  it('parses a valid number', () => {
    expect(parseOptionalNumber('71.50')).toBe(71.5)
  })
})

describe('normalizeWheelRow', () => {
  function makeRow(overrides: Record<string, string> = {}): ParsedRow {
    const raw: Record<string, string> = {
      PartNumber: '000000000001058059',
      PartDescription: 'NOMAD SPLIT 17X8.5 5X5 71 -12 MTL-BLK',
      Brand: 'Petrol',
      DisplayStyleNo: '058',
      Finish: 'Matte Black',
      Size: '17X8.5',
      BoltPattern: '5X5.0',
      Offset: '-12',
      CenterBore: '71.50',
      LoadRating: '2250',
      ShippingWeight: '32.00000',
      ImageURL: 'https://cdn.example.com/wheels/058-blk.jpg',
      InvOrderType: 'ST',
      Style: 'NOMAD',
      TotalQOH: '20',
      MSRP_USD: '369.99',
      MAP_USD: '369.99',
      RunDate: '05/07/2026 10:06:48 PM',
      '1001': '10',
      '1002': '5',
      '1003': '5',
      ...overrides,
    }
    return {
      partNumber: raw['PartNumber'],
      raw,
      warehouseColumns: ['1001', '1002', '1003'],
    }
  }

  it('sets productType to wheel', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.productType).toBe('wheel')
  })

  it('parses offset "-12" as offsetMm: -12', () => {
    const result = normalizeWheelRow(makeRow({ Offset: '-12' }))
    expect(result.offsetMm).toBe(-12)
  })

  it('parses MSRP "369.99" as msrpUsd: 369.99', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.msrpUsd).toBe(369.99)
  })

  it('parses size into diameterIn and widthIn', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.diameterIn).toBe(17)
    expect(result.widthIn).toBe(8.5)
  })

  it('parses bolt pattern into boltCount and boltCircleIn', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.boltCount).toBe(5)
    expect(result.boltCircleIn).toBe(5.0)
  })

  it('sums warehouse stock correctly', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.stockByWarehouse).toEqual({ '1001': 10, '1002': 5, '1003': 5 })
    expect(result.totalQoh).toBe(20)
  })

  it('returns null imageUrl for empty ImageURL', () => {
    const result = normalizeWheelRow(makeRow({ ImageURL: '' }))
    expect(result.imageUrl).toBeNull()
  })

  it('preserves zero-padded part number', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.partNumber).toBe('000000000001058059')
  })

  it('emits groupKey from brand + displayStyleNo (finish is a variant axis, not in the key — WB-059)', () => {
    const result = normalizeWheelRow(makeRow())
    expect(result.groupKey).toBe('Petrol|058')
  })

  it('emits per-SKU groupKey when displayStyleNo is empty', () => {
    const result = normalizeWheelRow(makeRow({ DisplayStyleNo: '' }))
    expect(result.groupKey).toBe('sku:000000000001058059')
  })
})
