import { model } from "@medusajs/framework/utils"

const VendorFeedStaging = model.define("vendor_feed_staging", {
  id: model.id().primaryKey(),
  run_id: model.text(),
  vendor_code: model.text(),
  part_number: model.text(),
  row_json: model.json(),
  normalized: model.json(),
  content_hash: model.text(),
}).indexes([
  { on: ["run_id", "part_number"], unique: true },
  { on: ["vendor_code", "part_number"] },
  { on: ["run_id", "content_hash"] },
])

export default VendorFeedStaging
