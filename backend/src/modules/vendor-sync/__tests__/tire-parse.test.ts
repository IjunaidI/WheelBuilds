import * as path from 'path'
import { parseTireCsv, detectWarehouseColumns } from '../adapters/wheelpros-tires/parse'
import { normalizeTireRow } from '../adapters/wheelpros-tires/normalize'

const FIXTURE_PATH = path.resolve(__dirname, '../__fixtures__/tires-small.csv')

describe('tire detectWarehouseColumns', () => {
  it('identifies numeric headers as warehouse codes', () => {
    const headers = ['Brand', 'PartNumber', '1001', '1002', 'Division', '1003']
    expect(detectWarehouseColumns(headers)).toEqual(['1001', '1002', '1003'])
  })
})

describe('parseTireCsv', () => {
  it('parses alphanumeric part_number as string', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].partNumber).toBe('F28840215')
    expect(typeof rows[0].partNumber).toBe('string')
  })

  it('parses zero-padded part_number as string', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    // Row 4 (index 3) is BKT with zero-padded part number
    expect(rows[3].partNumber).toBe('000000000094004379')
  })

  it('reads Brand correctly as the first column', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].raw['Brand']).toBe('Falken')
    expect(rows[3].raw['Brand']).toBe('BKT')
  })

  it('captures ManufacturerPartNumber', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    const normalized = normalizeTireRow(rows[0])
    expect(normalized.manufacturerPartNumber).toBe('28840215')
  })

  it('captures Division', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    const normalized = normalizeTireRow(rows[0])
    expect(normalized.division).toBe('10')
    const normalizedBkt = normalizeTireRow(rows[3])
    expect(normalizedBkt.division).toBe('20')
  })

  it('accepts InvOrderType ST, N2, and SO', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].raw['InvOrderType']).toBe('ST')
    expect(rows[2].raw['InvOrderType']).toBe('N2')
    expect(rows[4].raw['InvOrderType']).toBe('SO')
  })

  it('preserves real ImageURL values', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    const normalized = normalizeTireRow(rows[0])
    expect(normalized.imageUrl).toBe('https://images.wheelpros.com/m500/mFTWPK4.png')
  })

  it('returns null imageUrl for empty ImageURL', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    // Row 5 (index 4) is SO with empty ImageURL
    const normalized = normalizeTireRow(rows[4])
    expect(normalized.imageUrl).toBeNull()
  })

  it('detects numeric column headers as warehouse codes', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].warehouseColumns).toEqual(['1001', '1002', '1003'])
  })

  it('parses all 5 rows from fixture', async () => {
    const rows = []
    for await (const row of parseTireCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows).toHaveLength(5)
  })
})
