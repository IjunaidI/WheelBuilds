import { parseTireSize } from '../utils/tire-parse-helpers'
import { normalizeTireRow } from '../adapters/teraflex-tires/normalize'
import { ParsedRow } from '../adapters/types'

describe('parseTireSize', () => {
  it('parses metric format: 235/55ZR17', () => {
    const result = parseTireSize('235/55ZR17  AZFK450 99W  SL 26.7 2355517')
    expect(result.tireWidthMm).toBe(235)
    expect(result.aspectRatio).toBe(55)
    expect(result.constructionType).toBe('R')
    expect(result.rimDiameterIn).toBe(17)
    expect(result.speedRating).toBe('W')
    expect(result.loadIndex).toBe(99)
  })

  it('parses LT inch format: LT37X12.50R18 128R E', () => {
    const result = parseTireSize('WDPEAK AT4W LT37X12.50R18 128R E')
    expect(result.tirePrefix).toBe('LT')
    expect(result.tireWidthMm).toBeNull()
    expect(result.aspectRatio).toBeNull()
    expect(result.rimDiameterIn).toBe(18)
    expect(result.loadIndex).toBe(128)
    expect(result.speedRating).toBe('R')
    expect(result.plyRating).toBe('E')
  })

  it('parses bias/agricultural format: 12.4-24 8PR', () => {
    const result = parseTireSize('12.4-24 8PR BKT TR171 TT 451224')
    expect(result.plyRating).toBe('8PR')
    expect(result.rimDiameterIn).toBe(24)
    expect(result.tireWidthMm).toBeNull()
    expect(result.aspectRatio).toBeNull()
    expect(result.constructionType).toBeNull()
    expect(result.speedRating).toBeNull()
    expect(result.loadIndex).toBeNull()
  })

  it('parses WDPEAK prefix: WDPEAK AT4W 305/45R22 118S', () => {
    const result = parseTireSize('WDPEAK AT4W 305/45R22 118S')
    expect(result.tireWidthMm).toBe(305)
    expect(result.aspectRatio).toBe(45)
    expect(result.rimDiameterIn).toBe(22)
    expect(result.loadIndex).toBe(118)
    expect(result.speedRating).toBe('S')
    expect(result.constructionType).toBe('R')
  })

  it('parses metric with Z speed modifier: 255/35ZR19', () => {
    const result = parseTireSize('255/35ZR19 FK453 (96Y) XL BLK 2553519')
    expect(result.tireWidthMm).toBe(255)
    expect(result.aspectRatio).toBe(35)
    expect(result.constructionType).toBe('R')
    expect(result.rimDiameterIn).toBe(19)
  })

  it('returns all nulls for unparseable description', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = parseTireSize('SOME UNKNOWN FORMAT 12345')
    expect(result.tireWidthMm).toBeNull()
    expect(result.aspectRatio).toBeNull()
    expect(result.constructionType).toBeNull()
    expect(result.rimDiameterIn).toBeNull()
    expect(result.loadIndex).toBeNull()
    expect(result.speedRating).toBeNull()
    expect(result.plyRating).toBeNull()
    expect(result.tirePrefix).toBeNull()
    warnSpy.mockRestore()
  })

  it('does not throw for unparseable description', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => parseTireSize('TOTALLY RANDOM TEXT')).not.toThrow()
    warnSpy.mockRestore()
  })

  it('handles empty description', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = parseTireSize('')
    expect(result.tireWidthMm).toBeNull()
    expect(result.rimDiameterIn).toBeNull()
    warnSpy.mockRestore()
  })
})

describe('normalizeTireRow', () => {
  function makeRow(overrides: Record<string, string> = {}): ParsedRow {
    const raw: Record<string, string> = {
      Brand: 'Falken',
      PartNumber: 'F28840215',
      PartDescription: 'WDPEAK AT4W 305/45R22 118S',
      ManufacturerPartNumber: '28840215',
      ImageURL: 'https://images.wheelpros.com/m500/mFTWPK4.png',
      InvOrderType: 'ST',
      TotalQOH: '8',
      MSRP_USD: '462.00',
      MAP_USD: '462.00',
      RunDate: '05/17/2026 6:06:12 PM',
      Division: '10',
      '1001': '4',
      '1002': '2',
      '1003': '2',
      ...overrides,
    }
    return {
      partNumber: raw['PartNumber'],
      raw,
      warehouseColumns: ['1001', '1002', '1003'],
    }
  }

  it('sets productType to tire', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.productType).toBe('tire')
  })

  it('parses tire dimensions from description', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.tireWidthMm).toBe(305)
    expect(result.aspectRatio).toBe(45)
    expect(result.rimDiameterIn).toBe(22)
    expect(result.loadIndex).toBe(118)
    expect(result.speedRating).toBe('S')
    expect(result.constructionType).toBe('R')
  })

  it('preserves division as string', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.division).toBe('10')
  })

  it('preserves division "20" as string', () => {
    const result = normalizeTireRow(makeRow({ Division: '20' }))
    expect(result.division).toBe('20')
  })

  it('sums warehouse stock correctly', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.stockByWarehouse).toEqual({ '1001': 4, '1002': 2, '1003': 2 })
    expect(result.totalQoh).toBe(8)
  })

  it('preserves manufacturer part number', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.manufacturerPartNumber).toBe('28840215')
  })

  it('returns null manufacturerPartNumber for empty value', () => {
    const result = normalizeTireRow(makeRow({ ManufacturerPartNumber: '' }))
    expect(result.manufacturerPartNumber).toBeNull()
  })

  it('parses MSRP correctly', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.msrpUsd).toBe(462)
  })

  it('preserves alphanumeric part number', () => {
    const result = normalizeTireRow(makeRow())
    expect(result.partNumber).toBe('F28840215')
  })

  it('returns null imageUrl for empty ImageURL', () => {
    const result = normalizeTireRow(makeRow({ ImageURL: '' }))
    expect(result.imageUrl).toBeNull()
  })

  it('handles unparseable description gracefully', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = normalizeTireRow(makeRow({ PartDescription: 'UNKNOWN TIRE FORMAT' }))
    expect(result.tireWidthMm).toBeNull()
    expect(result.aspectRatio).toBeNull()
    expect(result.rimDiameterIn).toBeNull()
    expect(result.productType).toBe('tire')
    warnSpy.mockRestore()
  })
})
