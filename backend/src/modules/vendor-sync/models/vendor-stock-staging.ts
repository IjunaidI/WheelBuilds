import { model } from "@medusajs/framework/utils"

const VendorStockStaging = model.define("vendor_stock_staging", {
  id: model.id().primaryKey(),
  run_id: model.text(),
  vendor_code: model.text(),
  part_number: model.text(),
  warehouse_code: model.text(),
  qoh: model.number(),
}).indexes([
  { on: ["run_id", "part_number", "warehouse_code"], unique: true },
  { on: ["run_id", "part_number"] },
])

export default VendorStockStaging
