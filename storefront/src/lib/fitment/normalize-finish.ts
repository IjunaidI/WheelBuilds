import { Finish } from "@modules/common/components/wheel"

/**
 * Collapse a free-text vendor finish into the 3-bucket Finish enum
 * (black | bronze | silver). Precedence:
 *   1. bronze/gold/copper/brass → bronze
 *   2. an explicit "black" token → black (dominates a silver accent)
 *   3. silver/chrome/machined/milled/polished/gunmetal/grey/gray/titanium/graphite → silver
 *   4. everything else (incl. unknowns) → black
 *
 * LOCKSTEP: twin of backend/src/modules/vendor-sync/search/normalize-finish.ts.
 * Both are guarded against drift by fixtures/finish-normalize-golden.json
 * (see __tests__/normalize-finish.test.ts here + the backend golden test).
 * Update the golden and both copies together.
 */
export function normalizeFinish(raw: unknown): Finish {
  const s = String(raw ?? "").toLowerCase()
  if (/bronze|gold|copper|brass/.test(s)) return "bronze"
  if (s.includes("black")) return "black"
  if (/silver|chrome|machined|milled|polished|gunmetal|gr[ae]y|titanium|graphite/.test(s))
    return "silver"
  return "black"
}
