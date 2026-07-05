import { createReadStream } from "fs"
import { parse } from "csv-parse"
import { ParsedRow } from "./types"

/** Any header whose name is purely numeric is a warehouse code. */
export function detectWarehouseColumns(headers: string[]): string[] {
  return headers.filter((h) => /^\d+$/.test(h))
}

/**
 * Stream a vendor CSV, yielding one ParsedRow per non-empty PartNumber.
 * True streaming: the file is read incrementally (csv-parse over a read
 * stream), never fully buffered. `relax_column_count` mirrors the prior
 * papaparse tolerance for FieldMismatch rows.
 *
 * Warehouse columns MUST be derived from the header line, not from the
 * first data record: `relax_column_count` allows a short/ragged first
 * data row, and `Object.keys()` on that row would silently omit trailing
 * (often numeric warehouse-code) headers, poisoning the cached
 * warehouseColumns for every subsequent row in the file. `csv-parse`'s
 * `columns` option accepts a callback that receives the raw header
 * array on the first line — use that instead, mirroring how the prior
 * papaparse implementation read warehouse columns from `result.meta.fields`.
 */
export async function* streamCsvRows(filePath: string): AsyncIterable<ParsedRow> {
  let warehouseColumns: string[] = []
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: (header: string[]) => {
        warehouseColumns = detectWarehouseColumns(header)
        return header
      },
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    })
  )

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    const partNumber = record["PartNumber"] || ""
    if (!partNumber) continue
    yield { partNumber, raw: record, warehouseColumns }
  }
}
