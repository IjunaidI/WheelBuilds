export type TireType = "passenger" | "light-truck" | "other"

/** Storefront-local mirror of the backend classifyTireTypeFromMeta (display-only badge).
 *  Prefix wins; else structural from a representative variant's metadata. */
export function classifyTireType(
  prefix: string | null | undefined,
  rep: Record<string, unknown>
): TireType {
  const p = typeof prefix === "string" ? prefix.toUpperCase() : ""
  if (p === "LT") return "light-truck"
  if (p === "P") return "passenger"
  if (p === "ST") return "other"
  const width = rep.tire_width_mm
  const aspect = rep.aspect_ratio
  if (typeof width === "number" && typeof aspect === "number") return "passenger"
  if (rep.construction_type != null) return "light-truck"
  return "other"
}
