/**
 * Collapse a free-text vendor finish into the storefront's 3-bucket Finish
 * enum (black | bronze | silver). Keyword precedence: bronze/gold/copper →
 * bronze; silver/chrome/machined/gunmetal/grey → silver; everything else
 * (incl. black and unknowns) → black. The raw vendor string is kept in
 * product metadata elsewhere; this is only for the swatch + facet bucket.
 */

export type Finish = "black" | "bronze" | "silver"

const BRONZE = ["bronze", "gold", "copper", "brass"]
const SILVER = [
  "silver",
  "chrome",
  "machined",
  "polished",
  "gunmetal",
  "grey",
  "gray",
  "titanium",
  "graphite",
]

export function normalizeFinish(raw: string | null | undefined): Finish {
  const s = (raw ?? "").toLowerCase()
  if (!s) return "black"
  if (BRONZE.some((k) => s.includes(k))) return "bronze"
  if (SILVER.some((k) => s.includes(k))) return "silver"
  return "black"
}
