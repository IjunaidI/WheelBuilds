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
 * Parse a tire CSV file and yield ParsedRow objects.
 * Reads the file into memory and parses with papaparse (header mode),
 * then yields rows one at a time for downstream async iteration.
 *
 * The tire CSV has Brand as column 1 and PartNumber as column 2,
 * but since we use header: true, column order is irrelevant.
 */
export async function* parseTireCsv(filePath: string): AsyncIterable<ParsedRow> {
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
