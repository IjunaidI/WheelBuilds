# WB-104 · Trim honesty — reverse-fitment identity + trim-narrowing integrity — design

> G11 Wave 2 (runs with WB-091 — adjacent files, separate commits/branch discipline).
> Findings **T1, T2, T3, T4, T5** ([audit §T](../../future/plans/2026-07-13-ux-completeness-audit.md)) — root-caused live (code + git history) in the audit.
> Re-verified against current `main` (`05ed651`) 2026-07-14 — evidence inline. Backend + storefront.

## Problem
WB-077 (`0ae83be`) made reverse-fitment cache rows **multi-trim** (windows/bolt-patterns union across every trim in `raw.data`), but `extractVehicleIdentity` (WB-009 `4d0992f`, untouched) still reads `raw.data[0]` for the displayed make/model/**trim**. With "Any trim" the drawer DEFAULT, most cache rows are multi-trim, so the PDP "N CONFIRMED MODELS" list (wheel AND tire — shared helper) publicly renders "2021 Ford F-150 〈arbitrary trim〉 ✓" where the match may hold only via a *different* trim. The "YOUR VEHICLE" highlight compounds it (arbitrary-trim compare + make **slug**-vs-display-**name** → multi-word makes never highlight). Two seams silently discard a chosen trim: the trim dropdown is the GLOBAL modifications catalog while fitment queries `usdm`, and the `/modifications/` `slug` payload assumption is untested.

## Decisions
- **T1 rule (explicit):** in `extractVehicleIdentity`, compute `new Set(raw.data.map(e => e.trim))`; if the set has size 1 (non-empty) OR `raw.data.length === 1` → keep that trim; else `trim: undefined`. A union row renders "2021 Ford F-150" with no trim claim. Thread `trimNarrowed: boolean` (`raw.data.length === 1`) onto `ReverseFitmentVehicle`/`ReverseTireFitmentVehicle` for future disclosure — display change stays minimal.
- **T3 region param is additive:** `modifications(make, model, year, region = "usdm")` at every layer (client/service/route); cache key gains region (old 3-part rows orphan silently, same non-breaking pattern as WB-077's cache-key v2). No caller forced to change.

## Design
1. **Trim-honest identity (T1, backend `reverse-fitment.ts`).** `extractVehicleIdentity` becomes multi-trim-aware per the rule above. Make/model/year-label unchanged. Both reverse builders (wheel `buildReverseFitment` + tire `buildReverseTireFitment`) get it for free via the shared helper. Add the `trimNarrowed` field.
2. **Honest YOUR-VEHICLE matching (T2, storefront `fitment/index.tsx` + `tire/fitment.tsx`).** New storefront `slugify` helper (mirror the backend vendor-sync pattern; none exists in `storefront/src` today). Make/model compare via `slugify(f.x) === slugify(active.x)` (direction-agnostic — works slug↔name). Trim: keep the existing permissive `!f.trim || matches` (union rows now carry `trim: undefined` so they anchor on make/model/year); when the row IS trim-narrowed, compare against BOTH the vehicle's stored trim label AND its `modificationSlug` (slug-normalized). Port the same normalization to the tire highlight while WB-091's P13 (year/trim) lands there — coordinate, don't duplicate.
3. **Region-scoped trim dropdown (T3).** `client.modifications` + `service.listModifications` + `/store/vehicle-catalog/modifications` gain a `region` param (default `usdm`, matching fitment) so the drawer only offers trims that can narrow a `usdm` lookup. AND make the silent fallback visible: when `resolveByModel` falls back from a trim-narrowed query to the broad one, `logger.warn` with the discarded slug and set `source.trimNarrowed = false` on the returned fitment (additive; no required UI change this pass).
4. **Pin the slug contract (T4).** Extend the gated live test (`RUN_WHEEL_SIZE_LIVE`) with: (a) `/modifications/` items expose a string `slug`; (b) a `by_model` narrowed by one of those slugs returns non-empty data whose entries all carry that trim. Plus an offline unit test freezing `toOptions`' slug-first precedence against a captured modifications fixture.
5. **Ops (T5).** Current `main` is WB-077 `|v2` cache keys (confirmed `cache-key.ts:19`). If the region param changes the cache-key shape, old rows orphan (self-heal via re-warm). Record in STATUS whether a prod `wheel_size_fitment` re-warm/truncate is needed; the any-trim union semantics stay as-designed (WB-077).

## Verify
- Unit (backend): `extractVehicleIdentity` golden — multi-trim raw → `trim: undefined`; single-trim / all-same-trim raw → that trim; both reverse builders emit no trim for union rows. (Fills the current test gap — `rawOf` only builds single-entry data.)
- Unit (storefront): highlight matrix — slug-vs-name make (`land-rover` ↔ `Land Rover`), label-vs-slug trim, union-row (no trim) anchoring on year/make/model.
- Gated live: modifications slugs resolve through `by_model` narrowed non-empty.
- Live smoke: a PDP whose confirmed list previously showed a trim on an any-trim row now shows the bare vehicle; a trim-picked vehicle highlights its own row.

## Deploy
Backend deploy → restart. The region-scoped modifications cache-key change orphans old catalog rows (self-heal). Verify prod runs WB-077 (`|v2`); a `wheel_size_fitment` re-warm is optional (identity is computed at read-time from the stored raw, so existing rows get the fix on next read — no re-warm strictly required).

## Out of scope
Per-trim verdict windows (would reopen WB-077's false-negative trade-off — escalation path only if wrong-trim FITS complaints persist AFTER this); confirmed-list disclosure copy overhaul (WB-091 P14).
