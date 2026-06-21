import { model } from "@medusajs/framework/utils"

const VendorFeedRun = model.define("vendor_feed_run", {
  id: model.id().primaryKey(),
  vendor_code: model.text(),
  source_filename: model.text(),
  source_archive_key: model.text().nullable(),
  source_modify_time: model.text().nullable(),
  run_date_vendor: model.dateTime().nullable(),
  row_count: model.number().default(0),
  skipped_no_image_count: model.number().default(0),
  hash_match_count: model.number().default(0),
  new_count: model.number().default(0),
  changed_count: model.number().default(0),
  discontinued_count: model.number().default(0),
  status: model.text(),
  approved_by: model.text().nullable(),
  approved_at: model.dateTime().nullable(),
  error_message: model.text().nullable(),
  failed_part_numbers: model.json().nullable(),
  failed_group_keys: model.json().nullable(),
  apply_attempt_count: model.number().default(0),
  started_at: model.dateTime(),
  finished_at: model.dateTime().nullable(),
}).indexes([
  { on: ["vendor_code", "status"] },
  { on: ["created_at"] },
])

export default VendorFeedRun
