import * as path from "path"
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
})
