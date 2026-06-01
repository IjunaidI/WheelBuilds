import { model } from "@medusajs/framework/utils"
const WheelSizeQuota = model.define("wheel_size_quota", {
  id: model.id().primaryKey(),
  day: model.text(),           // "YYYY-MM-DD" in GMT (the wheel-size reset boundary)
  count: model.number().default(0),
}).indexes([{ on: ["day"], unique: true }])
export default WheelSizeQuota
