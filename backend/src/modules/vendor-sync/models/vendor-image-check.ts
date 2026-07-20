import { model } from "@medusajs/framework/utils"

/**
 * WB-115 persistent cache for the image-reachability gate. `url` is the
 * primary key (there is one row per distinct vendor thumbnail URL, shared
 * across every SKU/run that references it) so a re-check of the same URL
 * from a different vendor row or a later run is a single upsert, not a
 * growing history table.
 *
 * `last_status` is the raw HTTP status from the most recent HEAD probe, or
 * null when the probe never got a definitive response (timeout, DNS
 * failure, thrown error) -- see `classifyImageResponse` in
 * `pipeline/image-reachability.ts` for how that maps to dead/alive.
 * `consecutive_failures` counts back-to-back dead (404/410) classifications
 * and resets to 0 the moment a check comes back alive.
 */
const VendorImageCheck = model.define("vendor_image_check", {
  url: model.text().primaryKey(),
  last_status: model.number().nullable(),
  last_checked_at: model.dateTime(),
  consecutive_failures: model.number().default(0),
})

export default VendorImageCheck
