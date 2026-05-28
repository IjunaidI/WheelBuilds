/**
 * Collapse a free-text vendor finish into the storefront's 3-bucket Finish
 * enum (black | bronze | silver). Keyword precedence: bronze/gold/copper/brass
 * → bronze; silver/chrome/machined/polished/gunmetal/grey/gray/titanium/graphite
 * → silver; everything else (incl. black and unknowns) → black. The raw vendor
 * string is kept in product metadata elsewhere; this is only for the swatch +
 * facet bucket.
 *
 * Note: because silver keywords take precedence over a "black" substring,
 * finishes like "Black Chrome" or "Machined Black" bucket as silver. This is an
 * accepted limitation of the lossy 3-bucket mapping (Spec §5 G1); the raw finish
 * is preserved in metadata for any later refinement.
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
