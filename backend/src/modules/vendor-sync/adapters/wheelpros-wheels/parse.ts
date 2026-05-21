import * as fs from 'fs'
import * as papa from 'papaparse'
import { ParsedRow } from '../types'

/**
 * Detect warehouse columns from CSV headers.
 * Any header whose name is purely numeric is treated as a warehouse code.
 */
export function detectWarehouseColumns(headers: string[]): string[] {
  return headers.filter((h) => /^\d+$/.test(h))
}

/**
 * Parse a wheel CSV file and yield ParsedRow objects.
 * Reads the file into memory (typically ~5MB) and parses synchronously,
 * then yields rows one at a time for downstream async iteration.
 */
export async function* parseWheelCsv(filePath: string): AsyncIterable<ParsedRow> {
  const content = fs.readFileSync(filePath, 'utf-8')

  const result = papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.type !== 'FieldMismatch')
    if (critical.length > 0) {
      throw new Error(
        `CSV parse errors: ${critical.map((e) => `Row ${e.row}: ${e.message}`).join('; ')}`
      )
    }
  }

  const headers = result.meta.fields || []
  const warehouseColumns = detectWarehouseColumns(headers)

  for (const row of result.data) {
    const partNumber = row['PartNumber'] || ''
    if (!partNumber) continue

    yield {
      partNumber,
      raw: row,
      warehouseColumns,
    }
  }
}
