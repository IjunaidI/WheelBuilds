// backend/src/modules/wheel-size/sub-models.ts
// WB-113: pure helpers for the marketing sub-model axis (wheel-size.com's
// `trim_levels`, e.g. "L"/"LE"/"LE Eco" on a Corolla) — distinct from the
// engine "modification"/trim ("1.8i") that `by_model`/`modifications` already
// key on. `trim_levels` is many-to-one with an entry (one engine entry can
// list several trims) AND the same trim can appear on multiple entries (e.g.
// a truck's "LT" under both a gas and a diesel engine entry) — these two fns
// handle both directions of that relationship. Plain module, not a Medusa
// service: no I/O, no container, just array plumbing so it's trivially unit
// testable and reusable from the service layer (Task 2) without DI ceremony.

/** Anything carrying a `trim_levels` array — RawByModelEntry, the /modifications
 *  entry shape, or a test fixture; only this one field is read. */
export type TrimLevelsCarrier = { trim_levels?: string[] | null }

/**
 * The synthetic "no sub-model narrowing" sentinel (Task 2 review Minor):
 * every wheel-size vehicle is expected to expose this as the catch-all
 * dropdown option when its `trim_levels` union is empty. Shared with
 * service.ts (fitment resolution) and, going forward, the store route
 * (Task 3) + storefront (Task 4) — extracted here instead of a bare literal
 * repeated at each call site.
 */
export const BASE_SUBMODEL = "Base"

/**
 * Deduped, first-seen-order union of `trim_levels` across every entry for a
 * make/model/year. An entry with no `trim_levels` key, or a null/empty array,
 * contributes nothing (skipped, not an error) — a make/model/year with zero
 * sub-model data anywhere returns `[]`.
 */
export function subModelsForModelYear(entries: TrimLevelsCarrier[]): string[] {
  const seen = new Set<string>()
  const union: string[] = []
  for (const entry of entries) {
    const trims = entry?.trim_levels
    if (!trims || !trims.length) continue
    for (const trim of trims) {
      if (!seen.has(trim)) {
        seen.add(trim)
        union.push(trim)
      }
    }
  }
  return union
}

/**
 * Entries whose `trim_levels` includes `subModel`. The caller (Task 2's
 * service layer) unions the matched entries' fitment data, so a sub-model
 * that spans 2 entries (e.g. a truck's "LT" under gas + diesel engines)
 * correctly returns BOTH.
 *
 * `subModel === "Base"`, `undefined`, or `""` is the no-narrow / fallback
 * case — every wheel-size vehicle is expected to expose "Base" as the
 * catch-all option — and returns ALL entries unfiltered.
 *
 * A real, non-Base sub-model that matches nothing returns the literal `[]`
 * match set. Whether an empty match should fall back to "all entries" is a
 * service-layer policy decision (Task 2), not this pure fn's job.
 */
export function filterEntriesBySubModel<T extends TrimLevelsCarrier>(
  entries: T[],
  subModel: string | undefined
): T[] {
  if (subModel === BASE_SUBMODEL || subModel === undefined || subModel === "") {
    return entries
  }
  return entries.filter((entry) => (entry?.trim_levels ?? []).includes(subModel))
}
