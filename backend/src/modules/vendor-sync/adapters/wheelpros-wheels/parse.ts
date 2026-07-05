import { ParsedRow } from '../types'
import { streamCsvRows, detectWarehouseColumns } from '../csv-stream'

// Kept for existing tests importing it from here.
export { detectWarehouseColumns }

/** Stream a wheel CSV and yield ParsedRow objects (WB-015). */
export function parseWheelCsv(filePath: string): AsyncIterable<ParsedRow> {
  return streamCsvRows(filePath)
}
