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
 */
export async function* streamCsvRows(filePath: string): AsyncIterable<ParsedRow> {
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    })
  )

  let warehouseColumns: string[] | null = null
  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    if (warehouseColumns === null) {
      warehouseColumns = detectWarehouseColumns(Object.keys(record))
    }
    const partNumber = record["PartNumber"] || ""
    if (!partNumber) continue
    yield { partNumber, raw: record, warehouseColumns }
  }
}
