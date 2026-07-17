import { BASE_SUB_MODEL } from "@lib/garage/sub-model"
import { Option } from "./to-options"

/**
 * WB-113: builds the 4th select's options straight from the sub-model union
 * `GET /store/vehicle-catalog/modifications` now returns
 * (`{ subModels: string[] }`) — replacing the old engine-modification
 * `{slug,name}[]` shape `toOptions` existed to parse (WB-104 T4). Value ===
 * label === the sub-model string, so no slug/name split is needed here.
 *
 * The sub-model select is MANDATORY (WB-113) — a vehicle+year with no
 * `trim_levels` data anywhere must still be selectable, so an empty union
 * collapses to a single synthetic `Base` option: the same sentinel the
 * backend's `BASE_SUBMODEL` treats as "no narrowing, resolve all entries".
 */
export function toSubModelOptions(subModels: string[] | null | undefined): Option[] {
  const list = Array.isArray(subModels)
    ? subModels.filter((s): s is string => typeof s === "string" && s.length > 0)
    : []
  if (!list.length) return [{ value: BASE_SUB_MODEL, label: BASE_SUB_MODEL }]
  return list.map((s) => ({ value: s, label: s }))
}
