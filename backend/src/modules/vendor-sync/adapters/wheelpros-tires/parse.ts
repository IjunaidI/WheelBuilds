import { ParsedRow } from '../types'
import { streamCsvRows, detectWarehouseColumns } from '../csv-stream'

export { detectWarehouseColumns }

/** Stream a tire CSV and yield ParsedRow objects (WB-015). */
export function parseTireCsv(filePath: string): AsyncIterable<ParsedRow> {
  return streamCsvRows(filePath)
}
