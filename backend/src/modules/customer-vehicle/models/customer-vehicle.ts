// backend/src/modules/customer-vehicle/models/customer-vehicle.ts
import { model } from "@medusajs/framework/utils"
const CustomerVehicle = model.define("customer_vehicle", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  client_id: model.text(),
  year: model.number(),
  make: model.text(),
  model: model.text(),
  trim: model.text().nullable(),
  modification_slug: model.text().nullable(),
  is_active: model.boolean().default(false),
  canonical_bolt_patterns: model.json().nullable(),
  hub_bore_mm: model.number().nullable(),
  diameter_window: model.json().nullable(),
  width_window: model.json().nullable(),
  offset_window: model.json().nullable(),
  fitment_status: model.text().nullable(),
  notes: model.text().nullable(),
}).indexes([
  { on: ["customer_id"] },
  { on: ["customer_id", "client_id"], unique: true },
])
export default CustomerVehicle
