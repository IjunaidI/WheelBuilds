# WB-113 · Sub-model vehicle selector (replace the engine-trim axis) — design

> Standalone fitment feature (user request 2026-07-17). Backend `wheel-size` + storefront YMM.
> Scouted + **live-probed** against the wheel-size.com v2 API 2026-07-17 — evidence inline.

## Problem
The vehicle selector's 4th axis shows wheel-size.com's **engine "modifications"** — `1.8i` / `1.8 VVT-i` / `2.0 VVT-i` — as an **optional** "Trim". Shoppers don't identify their car by engine displacement; they know its **marketing trim / sub-model** (L, LE, LE Eco, SE, XLE). The current `<select>` is populated by `getModifications` ([fitment.ts:9-10](../../../storefront/src/lib/data/fitment.ts#L9-L10)) → option value = the modification **slug**, label = the engine `name` ([to-options.ts:27-28](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/to-options.ts#L27-L28)); it is not `required` and is absent from `canSubmit` ([ymm-pane.tsx:193](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L193)).

## The data (live-probed, decisive)
wheel-size.com's v2 response carries the sub-models in a `trim_levels: string[]` field, **alongside** the engine `name`. Confirmed against the real **Toyota Corolla 2019 / usdm**:
```
/search/by_model/ → 2 entries, both engine "1.8i", both bolt 5x100:
   trim_levels: ["LE Eco"]
   trim_levels: ["L","LE","XLE","SE","XSE"]
   UNION → L, LE, LE Eco, SE, XLE, XSE
/modifications/    → SAME 2 entries, each ALSO carries trim_levels (e.g. ["LE Eco"])
```
Two facts that make this bounded, not a data-source overhaul: (a) `trim_levels` is on the **cheap `/modifications` catalog** endpoint the dropdown already calls (no extra quota call to populate it); (b) `trim_levels` is also on every `by_model` `data[]` entry, so fitment can filter by it. Nothing extracts it today — `RawByModelEntry` ([types.ts:51](../../../backend/src/modules/wheel-size/types.ts#L51)) doesn't type it.

## Decisions (defaults + approved)
- **Fully replace the engine axis** (approved). The sub-model (`trim_levels`) is the only 4th-axis selector; the engine `name` (`1.8i`) disappears from the picker.
- **Mandatory** (user request). The sub-model `<select>` gets `required` + joins `canSubmit` (like Make/Model/Year at [ymm-pane.tsx:305,327,352](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L305)).
- **"Base" fallback (approved).** When a vehicle+year's `trim_levels` union is empty, the dropdown shows a single synthetic **`Base`** option; picking it resolves fitment over ALL the vehicle's entries (today's no-trim union behavior). Never a dead-end.
- **Sub-model is the narrowing axis** (replaces the modification slug). Fitment = `by_model(make,model,year)` → filter `data[]` to entries whose `trim_levels` includes the pick → `normalizeByModel` over that subset. A sub-model spanning multiple engine entries (a truck's "LT" under gas+diesel) unions across them; the existing bore-agree-or-null logic ([normalize.ts:41-52](../../../backend/src/modules/wheel-size/normalize.ts#L41-L52)) already handles cross-entry disagreement.
- **No new data source, no migration.** wheel-size already has the data; the `wheel_size_fitment` table schema is unchanged (only the cache-key *values* change — stale engine-mod-keyed rows just stop being hit and re-resolve).

## Design

### Backend (`modules/wheel-size/` + the store route)
1. **Type + extract `trim_levels`.** Add `trim_levels?: string[]` to `RawByModelEntry` ([types.ts:51](../../../backend/src/modules/wheel-size/types.ts#L51)) and to the `/modifications` entry shape. A pure `subModelsForModelYear(entries)` → the deduped, order-preserving union of `trim_levels` across a make/model/year's entries (`[]` when none).
2. **`/store/vehicle-catalog/modifications`** ([listModifications, service.ts:318-342](../../../backend/src/modules/wheel-size/service.ts#L318-L342)) returns the **sub-model union** for the dropdown (the store route response shape changes from engine `{slug,name}[]` to `{ subModels: string[] }`). Cheap/lazy-cached as today (the catalog endpoint, not `by_model`).
3. **`resolveByModel` gains a `subModel` param** ([service.ts:238-299](../../../backend/src/modules/wheel-size/service.ts#L238-L299)): fetch `by_model(make,model,year)` (broad — no `modification` param), then a pure `filterEntriesBySubModel(data, subModel)` keeps entries whose `trim_levels` includes it; `subModel === "Base"`/absent → all entries. `normalizeByModel` runs over the filtered subset (unchanged internally — it already unions across N entries).
4. **Cache** ([cache-key.ts:12-20](../../../backend/src/modules/wheel-size/cache-key.ts#L12-L20)): the cache strategy is settled in step 6 (the plan reads whether the layer stores raw vs normalized). Either way there is **no schema change** and **no migration** — the existing engine-mod-keyed rows simply stop being hit and re-resolve (warm cron re-warms). If the layer stores the normalized result, the `modificationSlug` key slot becomes the sub-model string (`bmw|3-series|2020|LE|usdm|v2`); if it stores raw, the sub-model drops out of the key entirely (see step 6).
5. **Reverse-fitment consistency** ([reverse-fitment.ts:42-61](../../../backend/src/modules/wheel-size/reverse-fitment.ts#L42-L61)): the PDP "confirmed models" trim display (WB-104) reads `trim_levels` instead of the engine name, staying honest (show a sub-model only when the cached entries agree, per WB-104's existing rule).
6. **Caching optimization (plan-verified).** Preferred: cache the broad `by_model` raw at make/model/year level and apply `filterEntriesBySubModel` at read, so a vehicle's N sub-models share ONE fetch. If the current cache stores the normalized (not raw) result, fall back to keying by sub-model (step 4). The plan's first task reads the cache layer and picks; both are correct, the raw-cache path is just fewer quota calls.

### Storefront (`ymm-pane.tsx`, `lib/data/fitment.ts`, vehicle store)
7. **The 4th `<select>`** is populated by the sub-model union (from the extended `getModifications` → rename to `getSubModels` for clarity). Option value = the sub-model string. `required` + in `canSubmit`. When the union is empty → a single `Base` option.
8. **`resolveFitmentForVehicle`** sends the **sub-model string** instead of the modification slug ([ymm-pane.tsx:217](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L217)); `fitment.ts` + the store route param change accordingly.
9. **Vehicle store**: the saved vehicle persists the sub-model (was the modification/trim). A vehicle loaded from localStorage under the OLD shape (an engine-slug where a sub-model is expected) re-resolves gracefully — treat an unrecognized stored value as "Base" (or prompt re-select) rather than erroring. Keep the offline `TRIMS_BY_MODEL` fallback ([vehicle-data.ts:58-111](../../../storefront/src/lib/garage/vehicle-data.ts#L58-L111)) — it's already marketing-trim-shaped, so it's the right kind of data on a fetch failure.

## Verify
Backend `test:fitment` — new pure units: `subModelsForModelYear` (union/dedup/order; Corolla → `[L,LE,LE Eco,SE,XLE,XSE]`; empty → `[]`); `filterEntriesBySubModel` (keeps trim_levels-matching entries; "Base"/absent → all; a sub-model spanning 2 entries → both); the cache-key sub-model slot; `normalizeByModel` still unions the filtered subset correctly (incl. bore-disagree → null). A **live probe** (gated `RUN_WHEEL_SIZE_LIVE`, like [live-slug.test.ts](../../../backend/src/modules/wheel-size/__tests__/live-slug.test.ts)) confirms `trim_levels` on `/modifications` + `by_model` for 2-3 more vehicles (a truck with overlapping trims, one with empty trim_levels). Storefront vitest + `next build`. Live smoke: **Toyota → Corolla → 2019 → the sub-model select shows L/LE/LE Eco/SE/XLE/XSE, is required (can't submit without it), and resolving it produces the same 5x100 fitment**; a vehicle with no trim_levels shows `Base` and still resolves.

## Deploy
Backend deploy + storefront rebuild. **No DB migration.** Existing engine-mod-keyed `wheel_size_fitment` rows become unused and re-resolve on demand (the warm cron re-warms the sub-model keys). localStorage-saved vehicles re-resolve gracefully (unrecognized stored trim → Base/re-select).

## Out of scope
Drive/trim-axle disambiguation (staggered — WB-102). A separate engine picker (engine is fully removed from the UI). Backfilling the static `vehicle-data.ts` Make/Model/Year lists to live wheel-size (unchanged; only the 4th axis changes). Per-sub-model image/spec differences (fitment only).
