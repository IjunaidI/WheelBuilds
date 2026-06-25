/**
 * Collapse a free-text vendor finish into the storefront's 3-bucket Finish
 * enum (black | bronze | silver). Keyword precedence:
 *   1. bronze/gold/copper/brass → bronze
 *   2. an explicit "black" token → black (dominates a silver accent)
 *   3. silver/chrome/machined/milled/polished/gunmetal/grey/gray/titanium/graphite → silver
 *   4. everything else (incl. unknowns) → black
 * The raw vendor string is kept in product metadata elsewhere; this is only for
 * the swatch + facet bucket.
 *
 * "black" dominates the silver-accent keywords so that synonymous black-face
 * finishes bucket identically: "Gloss Black Machined" and "Gloss Black Milled"
 * both → black (they used to split silver vs black because only "machined" was a
 * keyword). A bare "Machined"/"Milled" with no black face → silver.
 *
 * LOCKSTEP: the storefront PDP carries a twin
 * (storefront/src/lib/fitment/normalize-finish.ts). Both are guarded against drift
 * by fixtures/finish-normalize-golden.json — a test in EACH app asserts its copy
 * matches the shared vectors (see __tests__/normalize-finish-golden.test.ts here and
 * lib/fitment/__tests__/normalize-finish.test.ts in the storefront). Update the golden
 * and both copies together.
 */

export type Finish = "black" | "bronze" | "silver"

const BRONZE = ["bronze", "gold", "copper", "brass"]
const SILVER = [
  "silver",
  "chrome",
  "machined",
  "milled",
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
  if (s.includes("black")) return "black"
  if (SILVER.some((k) => s.includes(k))) return "silver"
  return "black"
}
