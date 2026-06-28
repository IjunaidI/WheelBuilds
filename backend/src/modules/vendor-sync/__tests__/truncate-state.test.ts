import {
  VENDOR_STATE_TABLES,
  truncateVendorState,
} from "../utils/truncate-state"

describe("truncateVendorState", () => {
  it("covers exactly the four vendor-sync state tables", () => {
    expect(VENDOR_STATE_TABLES).toEqual([
      "vendor_feed_run",
      "vendor_feed_staging",
      "vendor_stock_staging",
      "vendor_product_current",
    ])
  })

  it("issues a single TRUNCATE ... RESTART IDENTITY over all tables", async () => {
    const calls: string[] = []
    const knex = { raw: async (sql: string) => { calls.push(sql); return undefined } }
    await truncateVendorState(knex)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(
      "TRUNCATE TABLE vendor_feed_run, vendor_feed_staging, vendor_stock_staging, vendor_product_current RESTART IDENTITY"
    )
  })
})
