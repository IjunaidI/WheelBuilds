import { model } from "@medusajs/framework/utils"

const VendorProductCurrent = model.define("vendor_product_current", {
  id: model.id().primaryKey(),
  vendor_code: model.text(),
  part_number: model.text(),
  content_hash: model.text(),
  medusa_product_id: model.text().nullable(),
  medusa_variant_id: model.text().nullable(),
  inventory_item_id: model.text().nullable(),
  normalized: model.json(),
  last_seen_run_id: model.text().nullable(),
  applied_at: model.dateTime(),
  discontinued_at: model.dateTime().nullable(),
}).indexes([
  { on: ["vendor_code", "part_number"], unique: true },
  { on: ["medusa_product_id"] },
  { on: ["vendor_code", "content_hash"] },
])

export default VendorProductCurrent
