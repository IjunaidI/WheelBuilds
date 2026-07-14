# WB-088 · Discovery filter & listing truth — design

> G11 build-order chunk 4 (Wave 1). Findings **D4–D13, X10** from the
> [2026-07-13 UX audit §D/§X](../../future/plans/2026-07-13-ux-completeness-audit.md). Expands
> [fix design §WB-088](../../future/specs/2026-07-13-ux-completeness-fixes-design.md). All findings **re-verified against
> current `main`** (post-WB-089) on 2026-07-14 — evidence inline. Storefront-only except **one** backend settings line
> (`faceting.maxValuesPerFacet`, restart only — no re-sync).

## Problem
The discovery surfaces mislead: the bolt-pattern facet splits one physical pattern into several checkboxes (raw vendor strings), cards understate multi-size products and render "From $0.00", a Meili/Store-API outage blames the shopper's filters, price inputs push a full navigation per keystroke, facet lists silently truncate at Meili's default 100, numeric facets sort wrong, out-of-range pages read "no matches", the `lit()` escaper mishandles backslashes, and duplicate DOM ids appear when the mobile filter drawer is open. Tires share most of these (see the twin matrix).

## Wheel ↔ tire twin (from re-verification)
| Fix | Wheel | Tire |
|---|---|---|
| D4 canonical bolt facet | **needed** | n/a (no bolt axis) |
| D5 card range/N-sizes | **needed** (port from tire) | already has range; **$0 suppression needed in both** |
| D6 outage empty state | needed | needed (separate adapter/template/empty-state) |
| D7 isCapped honesty | already (WB-074) | **needed** (entirely absent) |
| D8 price input commit | needed | needed (byte-identical block) |
| D9 maxValuesPerFacet | shared backend line (covers both) | + tire Size filter-as-you-type (tire-only new UI) |
| D10 numeric sort + inch mark | sort both; inch mark port from tire | rim inch mark already shipped |
| D11 page clamp | needed | needed |
| D12 `lit()` backslash | **single shared file** (`discovery/data/escape.ts`, tire imports it) | — |
| D13 scroll / fit=0 / exhaustive count | needed | scroll + count needed; fit=0-on-search is wheel-only in evidence |
| X10 dup ids | needed | needed |

## Decisions (defaults; consequential flagged)
- **D4 switches the `?boltPatterns=` URL value from raw → canonical.** Old bookmarked raw values won't match the canonical facet (that filter shows nothing) — acceptable for transient discovery URLs. A **new** mm→inch PCD label table is required (none exists in the repo) for the dual-unit label — golden-guarded like the other bolt-pattern/finish twins, because a wrong inch label is a fitment error, not cosmetic.
- **D6 discriminated union** `DiscoveryResult | { ok: false }` — ripples through both templates + both empty-states (a third branch). The outage path stays **uncached** (throws already propagate past `unstable_cache`, so it self-heals) — only the outer catch returns `{ ok:false }`.
- **D8 scoped to price inputs only** — do NOT flip the shared `push` helper globally (it's used by checkbox toggles/sort/page, which push history intentionally). Price inputs get a separate commit-on-blur/Enter (or ≥500ms debounce) path using `router.replace`.

## Design (storefront unless noted)

1. **Canonical bolt facet (D4).** `FACET_FIELDS`/`buildFilters` (`discovery/data/get-products.ts:44,65-66`) switch `bolt_patterns` → `bolt_patterns_canonical`; `filter-sections.tsx` (`:177-187`) + `active-chips.tsx` (`:73-79`) render a dual-unit label ("6×139.7 (6×5.5″)") via a new pure `pcdInchLabel(canonical)` + a golden `mm→inch` table. (Backend canonical field already indexed + filterable since earlier work.)
2. **Card honesty (D5).** Extend `DiscoveryProduct` to carry the diameters array (min/max + count); `hitToProduct` (`:124-126`) drops `?? 0`. Wheel `product-card.tsx` renders a diameter **range** ("17″–24″") or **"N sizes"** (port the tire card's `rimRangeLabel`/`sizeCount` pattern); when a `diameters` filter is active, show the matching diameter. Suppress the price when `priceCents === 0` in **both** cards (`product-card.tsx:98-101`, `tire-product-card.tsx:58-61`).
3. **Outage-honest empty state (D6).** Both adapters' outer catch returns `{ ok: false }` instead of `emptyResult`; `templates/index.tsx` (both) render a "Catalog temporarily unavailable — retry" block instead of the no-matches copy. Cache behavior unchanged.
4. **Tire isCapped parity (D7).** Port `isCapped` + `estimatedTotalHits` onto `TireDiscoveryResult` (`tire-discovery/data/types.ts`), the fit-branch return (`get-tire-products.ts:174-181`), the header, and the mobile-trigger copy (add the wheel's `mobileTriggerLabel`/`mobileDrawerCta` helpers for tires) — mirror the wheel WB-074 machinery.
5. **Price inputs (D8).** Both `filter-sections.tsx` price blocks commit on blur/Enter (or debounce ≥500ms) via a `router.replace`-based scalar setter; clamp negatives to 0; swap when min>max. No per-keystroke navigation.
6. **Facet scale (D9).** `medusa-config.js` `indexSettings` gains `faceting: { maxValuesPerFacet: 500 }` (backend, restart only — index config, no content re-sync). Tire "Size" section gains a filter-as-you-type input over the loaded values.
7. **Polish (D10-D13, X10).**
   - D10: numeric-ascending sort for numeric-key facets (`filter-sections.tsx:45-47` both) — sort by `Number(k)` not `localeCompare`; port the tire `inchLabelMap` to the wheel Diameter section.
   - D11: clamp an out-of-range `?page` to the last valid page (in the template, once `totalCount`/`pageSize` known) instead of rendering the empty state.
   - D12: `escape.ts` `lit()` escapes backslashes before quotes (`.replace(/\\/g,'\\\\')` then `.replace(/"/g,'\\"')`) — single shared file, golden-tested.
   - D13: `setPage` scrolls to the grid top; the search-drawer submit preserves an active `fit=0` (thread it through `search-drawer/header.tsx:35`); use exhaustive `totalHits`/`exhaustiveNbHits` instead of `estimatedTotalHits` for the header count + pagination math (both modules).
   - X10: `filter-sections.tsx` ids gain a section+instance prefix (desktop rail vs mobile drawer) so the two mounted copies don't collide.

## Verify
- Vitest: facet builder uses `bolt_patterns_canonical`; `pcdInchLabel` golden (mm→inch); card range rendering + `$0` suppression; `lit()` backslash golden; page-clamp; price-input commit-on-blur semantics; numeric-ascending facet sort; the D6 `{ok:false}` branch renders the outage block; tire `isCapped` parity.
- Live: one physical bolt pattern = one checkbox with a dual-unit label; filter Diameter=22 → every card shows 22″; a >100-value facet is fully listed; a Meili outage shows "temporarily unavailable", not "no matches".

## Deploy
Storefront rebuild + one backend **restart** for `maxValuesPerFacet` (settings only — no re-sync; can piggyback any redeploy). D4's canonical field is already indexed (no re-sync needed for it).

## Out of scope
Availability/`in_stock` facet (WB-100); disjunctive fit facets (D3-adjacent, sanctioned deferral); search relevance (WB-087 owns findability).
