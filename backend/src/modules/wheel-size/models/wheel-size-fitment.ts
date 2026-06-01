import { model } from "@medusajs/framework/utils"
const WheelSizeFitment = model.define("wheel_size_fitment", {
  id: model.id().primaryKey(),
  cache_key: model.text(),     // `${modificationSlug}|${region}`
  region: model.text(),
  raw: model.json().nullable(),
  canonical_bolt_patterns: model.json(),
  hub_bore_mm: model.number().nullable(),
  diameter_window: model.json().nullable(),
  width_window: model.json().nullable(),
  offset_window: model.json().nullable(),
  status: model.text(),        // "ok" | "not_found"
  fetched_at: model.dateTime(),
}).indexes([{ on: ["cache_key"], unique: true }])
export default WheelSizeFitment
