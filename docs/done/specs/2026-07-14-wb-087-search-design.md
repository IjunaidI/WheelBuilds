# WB-087 · Search that finds products — design

> G11 build-order chunk 3 (Wave 1). Findings **D2, D3, L2, L7** from the
> [2026-07-13 UX audit §D/§L](../../future/plans/2026-07-13-ux-completeness-audit.md). Expands
> [fix design §WB-087](../../future/specs/2026-07-13-ux-completeness-fixes-design.md). All findings **re-verified against
> current `main`** (post-WB-089) on 2026-07-14 — evidence inline. Backend (Meili doc + settings) + storefront (query UI).
> **Couples to a Meili re-sync + a one-time re-title script — pair with WB-089's re-sync window.**

## Problem
Wheel titles are `Brand + DisplayStyleNo` (`buildGroupTitle`, `wheel-grouping.ts:165-170`); the human model name (feed `Style`, e.g. `NOMAD`) lands only in `product.metadata.style` (`build-metadata.ts:24-29`) and is never indexed or displayed. `searchableAttributes: ['title','brand','skus']` (`medusa-config.js:262`). So `"nomad"`→0 hits (proven from the checked-in fixture `Petrol 058 / Style=NOMAD`), sizes aren't searchable text, and there are no synonyms (`"rims"`→0). On the results page the active `?q` is invisible and unclearable: `hasAnyFilter` (`use-discovery-query.ts:169-177`) has no `q`, the header is hardcoded, `active-chips` has no `q` chip, and the empty state blames "these filters" (all mirrored in the tire twin).

**Reference to mirror:** WB-089 already solved the display half for tires — `buildTireGroupTitle` uses `expandTireModelName` for the title/search **without** touching `group_key`/handle (`tire-grouping.ts:58-61`, `model-alias.ts`). The wheel fix structurally matches that: change the human-facing title, never the handle.

## Decisions (defaults; consequential ones flagged)
- **Style-name heuristic = an alphabetic run ≥ 3 chars AND `style ≠ displayStyleNo` (case-insensitive).** This is tighter than the fix-doc's "has a letter" — verified it (a) treats real names like `NOMAD`/`MAVERICK` (run ≥ 3) as names, (b) treats codes like `PR126` (run "PR" = 2), `P3B`, `D719B` as codes → not appended. **This means the 2 existing `wheel-grouping.test.ts` title assertions (`Performance Replicas 126`, `Asanti Forged 172`, default style `PR126`) do NOT break** — the heuristic correctly classifies `PR126` as a code. New tests cover the real-name path.
- **`search_text` built PER-VARIANT, not cross-joined.** Size tokens (`"20x9"`) must be built inside the per-variant loop (where `d`/`w` are already computed, alongside `boltCanonical.push`), never by cross-joining the deduped `diameters × widths` arrays (which would invent false `"20x10"` tokens for a product offered only in 20×9 + 18×10).
- **Title change ships with a one-time `retitle-wheels.ts` script.** A `buildGroupTitle` change only affects NEW products; existing products keep their old title (vendor-sync's diff is hash-gated and skips unchanged groups). The doc's `style`/`search_text` fields + synonyms + settings land via a Meili reconcile alone (transformer re-runs on every published product), but the **title** needs the Medusa `product.title` actually updated — so a surgical `medusa exec` re-title script (recompute `buildGroupTitle` per wheel group, update if changed) is the deploy mechanism, then the reconcile picks up the new titles.

## Design

### Backend — doc + settings (`vendor-sync/search` + `medusa-config.js`)
1. **`style` in the doc + title (D2/L2).** `buildSearchDocument` wheel branch adds `style: str(meta.style)`. New pure `isRealStyleName(style, displayStyleNo)` (alpha-run≥3 ∧ ≠ code) in `wheel-grouping.ts`; `buildGroupTitle` appends when true → `"{Brand} {Style} {No}"`. **Handle derivation (`buildGroupHandle`) unchanged — no URL churn.**
2. **`search_text` field (L2/L7).** In `buildWheelDocument`, inside the per-variant loop accumulate `sizeTokens` (`"{d}x{w}"`), reuse `boltCanonical` (`"5x114.3"`), plus `style` words; emit `search_text: uniqStr([...sizeTokens, ...boltCanonical, style]).join(" ")`. Tire branch: `search_text` from `canonical_size` tokens + the expanded model words.
3. **Index settings (`medusa-config.js` `indexSettings`, currently `:262-281`).** `searchableAttributes: ['title','brand','style','skus','search_text']`; add `synonyms: { rims:['wheels'], wheels:['rims'], tyre:['tire'], tyres:['tires'] }`. `search_text`/`style` go in `searchableAttributes` only (not displayed/filterable). A new golden-style test guards the settings object (none exists today — `meili-index-settings.test.ts` only covers `fields`).

### Storefront — query visibility (D3, both modules)
4. Header shows `RESULTS FOR "<q>"` when `q` present (else the current heading). `active-chips` renders a removable `q` chip that clears `q` (navigates to the same URL minus `q`). `hasAnyFilter` callers OR in `!!query.q` (the field lives on `DiscoveryQuery`, not `DiscoveryFilters` — the wheel hook needs a `q` shorthand; the tire hook already returns `q`). Empty state names the query ("No results for \"<q>\""). Same in the `tire-discovery` twin.

## Verify
- Backend jest: `buildSearchDocument` emits `style` + per-variant-correct `search_text` (a 20×9 + 18×10 product does NOT get `"20x10"`); `isRealStyleName` golden (`NOMAD`→name, `PR126`/`P3B`→code); settings snapshot includes `style`/`search_text`/`synonyms`; existing `wheel-grouping.test.ts` title assertions unchanged (RED only for new real-name cases).
- Storefront vitest: `hasAnyFilter` true when only `q` set; `q` chip clears `q`; header/empty copy.
- Live (post re-sync + re-title): `"nomad"`, `"rims"`, `"20x9 <brand>"` each return hits; the query renders in the header and its chip clears it; a re-titled card shows `Petrol NOMAD 058`.

## Deploy (couple with WB-089's window)
1. Backend deploy → restart (picks up `searchableAttributes`/`synonyms` — Meili settings push at boot).
2. Run `retitle-wheels.ts` (`medusa exec`) on prod — updates existing wheel `product.title`s to the new form (surgical; only changed titles).
3. **Full Meili re-sync** — re-transforms every product so `style`/`search_text` + the new titles land. This is the SAME re-sync WB-089/WB-087 need; do them together. (The plugin's `meilisearch.sync` reconcile re-adds every published product through the transformer — it does not hash-skip, so all docs re-index.)

## Out of scope
Typeahead (WB-101); relevance tuning/ranking rules; a re-import (the re-title script avoids it).
