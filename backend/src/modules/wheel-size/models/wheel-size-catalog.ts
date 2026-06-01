import { model } from "@medusajs/framework/utils"
const WheelSizeCatalog = model.define("wheel_size_catalog", {
  id: model.id().primaryKey(),
  kind: model.text(),          // "makes" | "models" | "years" | "modifications"
  key: model.text(),           // the query signature, e.g. "ford|f-150|2021"
  payload: model.json(),
  fetched_at: model.dateTime(),
}).indexes([{ on: ["kind", "key"], unique: true }])
export default WheelSizeCatalog
