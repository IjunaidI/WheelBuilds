import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import { streamCsvRows, detectWarehouseColumns } from "../adapters/csv-stream"

const FIXTURE = path.resolve(__dirname, "../__fixtures__/wheels-small.csv")

describe("detectWarehouseColumns", () => {
  it("keeps purely-numeric headers only", () => {
    expect(detectWarehouseColumns(["Brand", "1014", "PartNumber", "37"])).toEqual(["1014", "37"])
  })
})

describe("streamCsvRows", () => {
  it("yields a row per non-empty PartNumber with detected warehouse columns", async () => {
    const rows: any[] = []
    for await (const r of streamCsvRows(FIXTURE)) rows.push(r)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.partNumber).toBeTruthy()
      expect(Array.isArray(r.warehouseColumns)).toBe(true)
      expect(r.raw).toBeDefined()
    }
  })

  // Stronger parity check: wheels-small.csv has a known row count (see wheel-parse.test.ts).
  it("parses all 5 rows from the wheels-small fixture", async () => {
    const rows: any[] = []
    for await (const r of streamCsvRows(FIXTURE)) rows.push(r)
    expect(rows).toHaveLength(5)
  })

  it("preserves zero-padded PartNumber as a string", async () => {
    const rows: any[] = []
    for await (const r of streamCsvRows(FIXTURE)) rows.push(r)
    expect(rows[0].partNumber).toBe("000000000001058059")
    expect(typeof rows[0].partNumber).toBe("string")
  })

  // Regression for the "warehouseColumns cached from the first DATA row"
  // bug: relax_column_count tolerates a short/ragged first data row, so
  // deriving warehouse columns from Object.keys(firstRecord) silently
  // drops trailing numeric headers for the whole file. Warehouse columns
  // must come from the HEADER line instead.
  it("derives warehouseColumns from the header line, not a ragged first data row", async () => {
    const tmpFile = path.join(os.tmpdir(), `csv-stream-ragged-${Date.now()}.csv`)
    // Header declares 3 warehouse columns (1014, 37, 42). The FIRST data
    // row is short — it omits the trailing two warehouse fields entirely
    // — while the SECOND data row supplies all of them. Under the old
    // "cache from first record's Object.keys()" logic, warehouseColumns
    // would be frozen at ["1014"] (or worse) for every row in the file.
    const csv = ["PartNumber,Brand,1014,37,42", "SKU-SHORT,Petrol,5", "SKU-FULL,Petrol,5,3,2", ""].join(
      "\n"
    )
    fs.writeFileSync(tmpFile, csv, "utf8")

    try {
      const rows: any[] = []
      for await (const r of streamCsvRows(tmpFile)) rows.push(r)

      expect(rows).toHaveLength(2)
      for (const r of rows) {
        expect(r.warehouseColumns).toEqual(["1014", "37", "42"])
      }
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})
