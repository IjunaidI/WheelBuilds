import * as path from 'path'
import { parseWheelCsv, detectWarehouseColumns } from '../adapters/teraflex-wheels/parse'
import { normalizeWheelRow } from '../adapters/teraflex-wheels/normalize'

const FIXTURE_PATH = path.resolve(__dirname, '../__fixtures__/wheels-small.csv')

describe('detectWarehouseColumns', () => {
  it('identifies numeric headers as warehouse codes', () => {
    const headers = ['PartNumber', 'Brand', '1001', '1002', 'Size', '1003']
    expect(detectWarehouseColumns(headers)).toEqual(['1001', '1002', '1003'])
  })

  it('does not include non-numeric headers', () => {
    const headers = ['PartNumber', 'MSRP_USD', 'RunDate']
    expect(detectWarehouseColumns(headers)).toEqual([])
  })
})

describe('parseWheelCsv', () => {
  it('parses zero-padded part number as string', async () => {
    const rows = []
    for await (const row of parseWheelCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].partNumber).toBe('000000000001058059')
    expect(typeof rows[0].partNumber).toBe('string')
  })

  it('detects numeric column headers as warehouse codes', async () => {
    const rows = []
    for await (const row of parseWheelCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows[0].warehouseColumns).toEqual(['1001', '1002', '1003'])
  })

  it('parses RunDate correctly after normalization', async () => {
    const rows = []
    for await (const row of parseWheelCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    const normalized = normalizeWheelRow(rows[0])
    expect(normalized.runDateVendor).toBeInstanceOf(Date)
    expect(normalized.runDateVendor.getFullYear()).toBe(2026)
    expect(normalized.runDateVendor.getMonth()).toBe(4) // May = 4
    expect(normalized.runDateVendor.getDate()).toBe(7)
  })

  it('empty fields produce null after normalization', async () => {
    const rows = []
    for await (const row of parseWheelCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    // Row index 3 has empty Finish and empty LoadRating
    const normalized = normalizeWheelRow(rows[3])
    expect(normalized.finish).toBeNull()
    expect(normalized.loadRatingLb).toBeNull()
  })

  it('parses all 5 rows from fixture', async () => {
    const rows = []
    for await (const row of parseWheelCsv(FIXTURE_PATH)) {
      rows.push(row)
    }
    expect(rows).toHaveLength(5)
  })
})
