# Tire store — grouping, indexing, discovery, and PDP — Design

> Date: 2026-07-02. Status: in-progress. Pillar: Vendor import + Discovery + PDP. Backlog: **WB-005** (G6).
> Tires have a complete ingestion layer (adapter → parse → normalize → typed `TireNormalizedRecord` →
> staging) but are deliberately terminated everywhere downstream: ungrouped (one product per SKU),
> un-indexed in Meilisearch (a bare `{id, product_type:"tire"}` stub), and invisible on the storefront
> (discovery + PDP are hardcoded to `product_type = "wheel"`). This design completes the **shoppable**
> tire journey: a customer can find, view, and buy tires end-to-end.
>
> **WB-005 is explicitly "a big spec alone."** It decomposes into three sequenced sub-projects, each its
> own spec → plan → build increment so every step is reviewable and the live wheel surfaces never regress.
> This session builds **Sub-project 1 (backend)**; sub-projects 2 and 3 follow as their own increments.

## Context

The vendor-sync pipeline pulls WheelPros CSV feeds, diffs against last-applied state, and writes products +
per-warehouse inventory into Medusa. Wheels are fully built: rows collapse into grouped products
(`Brand|DisplayStyleNo`) with a 7-axis variant model (bolt pattern × diameter × width × offset × center
bore × load rating × finish, WB-051/WB-059), get indexed by
[`buildSearchDocument`](../../../backend/src/modules/vendor-sync/search/build-search-document.ts), and drive
a faceted discovery surface + a rich PDP.

Tires stop short at every one of those stages:

- **Grouping** — [`normalize.ts:56`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts#L56)
  hardcodes `groupKey: sku:${partNumber}`; [`applyNewTireGroup`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L346-L403)
  asserts exactly one record per group and builds a single `"Default"` variant with **no option axes**.
- **Indexing** — [`build-search-document.ts:36`](../../../backend/src/modules/vendor-sync/search/build-search-document.ts#L36)
  returns `null` for non-wheels; [`medusa-config.js:277-281`](../../../backend/medusa-config.js#L277-L281)
  coalesces that to a facet-less `{id, product_type:"tire"}` stub. No tire attributes appear in the Meili
  index settings ([`medusa-config.js:253-268`](../../../backend/medusa-config.js#L253-L268)).
- **Storefront** — discovery is hardcoded to `product_type = "wheel"`
  ([`get-products.ts:57`](../../../storefront/src/modules/discovery/data/get-products.ts#L57)) with wheel-only
  `FACET_FIELDS`; the PDP loader ([`get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts))
  is entirely wheel-modeled; there is **zero tire source code** under `storefront/src`.

**What already exists to build on** (the ingestion substrate is done):
- Typed [`TireNormalizedRecord`](../../../backend/src/modules/vendor-sync/adapters/types.ts#L50-L62)
  carrying `tireWidthMm, aspectRatio, constructionType, rimDiameterIn, loadIndex, speedRating, plyRating,
  tirePrefix, manufacturerPartNumber, division`.
- [`parseTireSize`](../../../backend/src/modules/vendor-sync/utils/tire-parse-helpers.ts) — extracts those 8
  dimensions from the free-text `PartDescription` across metric / LT-inch / bias formats; never throws.
- Tire variant metadata already written by
  [`build-metadata.ts:70-80`](../../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts#L70-L80).
- A "Tires" product category (`tiresCategoryId`) created in bootstrap.
- `product_type` is already `filterable` in Meili — a `"tire"` scope is expressible the moment tire docs exist.
- Passing parse/normalize/hash unit tests + fixtures (`__fixtures__/tires-small.csv`).

## Decisions made in brainstorming

- **Scope = full shoppable journey; tire fitment DEFERRED.** Backend grouping+indexing + tire discovery +
  tire PDP + cart/checkout. No "does this tire fit my car" (vehicle OEM tire-size matching) — that is its own
  large piece and out of scope here. Cart/checkout/order flows are already generic and need ~zero new work.
- **Grouping = model-grouped** (like Tire Rack, and mirroring the wheel architecture): group **Brand +
  extracted model name** into one product; the **canonical size** (e.g. `305/45R22`) is the variant axis.
  A safe **per-SKU fallback** (`sku:${partNumber}`) applies whenever a model can't be confidently extracted —
  identical to how wheels fall back when `DisplayStyleNo` is empty. Rejected: (a) one-product-per-size —
  a degraded experience with a model line smeared across many cards; (b) the BACKLOG's literal
  "Brand + SectionWidth + AspectRatio + RimDiameter" rule — that groups by *size*, wrongly merging different
  models of the same size into one product.
- **Discovery surface = a dedicated `/tires` route** with its own facet rail, not a wheel/tire toggle on the
  live `/store` wheel discovery. Wheels and tires share almost no facets (only brand + price), and a separate
  route means zero regression risk to the shipped wheel discovery.
- **Model extraction is heuristic and honesty-gated.** The extractor strips everything known (size token,
  service description, noise tokens, brand, trailing size-code) and keeps the remainder as the model; if
  nothing credible survives, confidence is low → per-SKU fallback. Locked by a **golden fixture** (the same
  drift-guard pattern as `bolt-pattern-canonical-golden.json` / `finish-normalize-golden.json`) so real-feed
  surprises become new test vectors rather than silent mis-groupings.

**Design principle:** tires mirror the *proven wheel architecture* rather than inventing a parallel one. The
tire model extractor is the analogue of `computeWheelGroupKey`; the size variant axis is the analogue of the
wheel's diameter×width; the tire discovery/PDP reuse the wheel infrastructure parameterized by `product_type`.
No new DB migration anywhere — tires use existing tables and the shared Meili index. Pure helpers stay
unit-tested; re-group = re-import (no in-place data migration).

## Architecture & sequencing

```
Sub-project 1 — BACKEND: grouping + indexing        ← built this session
   extractTireModel → computeTireGroupKey → group_key
   multi-variant tire apply (canonical size = variant axis)
   buildSearchDocument tire branch + Meili tire facets
   → tires become grouped, indexed, discoverable products

Sub-project 2 — STOREFRONT: tire discovery          ← next increment
   dedicated /tires route + tire facet rail (rim dia, size, brand, type)
   generic discovery engine parameterized by a per-type discovery config

Sub-project 3 — STOREFRONT: tire PDP                ← final increment
   /products/[handle] branches on product_type → TireHero
   rim-diameter chips gate a size list; add-to-cart resolves the size variant
   (cart / checkout / order already generic → zero new work)
```

Backend is strictly first: nothing on the storefront can be built or tested until real grouped/indexed tire
products exist. Sub-projects 2 and 3 are storefront-only and independently shippable once #1 lands.

---

## Sub-project 1 · Backend grouping + indexing (this session)

### 1a · Model-name extractor — `wheelpros-tires/model-key.ts` (new, pure)

`extractTireModel(brand, partDescription)` → `{ model: string | null; confident: boolean }`.
Strategy: **strip-everything-known, keep the remainder.**

1. Locate + remove the **size token** — `parseTireSize` currently returns only the parsed fields, not the
   matched span, so either extend it to also return the matched substring (preferred, single source of truth)
   or re-run the same three size regexes in the extractor.
2. Remove the **service description** (`118S`, `99W`, `(96Y)`, `128R E`).
3. Remove **known noise tokens**: `SL`, `XL`, `BL`, `BLK`, `TT`, `TL`, ply `\d+PR`, the leading
   `P`/`LT`/`ST` prefix, the trailing repeated numeric size-code (`2355517`, `451224`), the overall-diameter
   decimal (`26.7`, `28.4`).
4. Remove the **brand** if it appears in the description (`BKT TR171` → `TR171`).
5. Collapse whitespace; the remainder is the model.

Verified against all 11 real feed rows → correct model for every one:
`WDPEAK AT4W` (×3 sizes), `AZFK450` (×4), `FK453`, `TR171` (×2), `ST5000`.

**Honesty guard:** if the remainder is empty or has no surviving alphabetic token, `confident = false`.
Locked by `fixtures/tire-model-golden.json` (real rows + model-before-size, model-after-size,
brand-in-description, and unparseable→fallback vectors), asserted in a `model-key` unit test.

### 1b · Group key — `wheelpros-tires/group-key.ts` (new)

```
computeTireGroupKey({ brand, model, confident, partNumber }):
  confident → `${brand}|${model}`     // e.g. "Falken|WDPEAK AT4W"
  else      → `sku:${partNumber}`     // honest fallback, mirrors wheels
```

Wired into [`normalize.ts:56`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts#L56),
replacing the hardcoded fallback. `TireNormalizedRecord` gains a `model: string | null` field (parallel to the
wheel's `displayStyleNo`), populated in `normalizeTireRow`.

### 1c · Canonical size — `canonicalTireSize` (new, pure)

Composes the variant-axis string from the parsed fields so equivalent sizes normalize identically and never
split a model accidentally (e.g. `235/55ZR17` and `235/55R17` → the same canonical size). Metric →
`{width}/{aspect}{construction}{rim}` (e.g. `305/45R22`); LT-inch / bias → their canonical inch forms
(e.g. `LT37X12.50R18`). Unparseable sizes keep the raw description token so the variant is still addressable.

### 1d · Multi-variant tire apply — rewrite `applyNewTireGroup`

Replace the single-`"Default"`-variant stub
([`apply.ts:346-403`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L346-L403)) with a real
multi-variant builder mirroring `applyNewWheelGroup`:

- **One option, `"Size"`**, values = the group's canonical sizes.
- **Product title** = `${brand} ${model}` (e.g. `Falken Wildpeak AT4W`); **handle** = slugified same.
  Representative record via the existing `pickGroupRepresentative` for brand/image/thumbnail.
- **De-dupe** two rows with the same canonical size in one model (keep in-stock/first, warn on drop) — the
  tire analogue of `dedupeExactDuplicates`.
- **Per-variant:** `sku = partNumber`, `prices` = MSRP (dollars — the dollars-in-Medusa convention),
  `manage_inventory: true`, `metadata = buildVariantMetadata` (already tire-aware). Inventory levels + the
  `inventory_item_id` extraction reuse the existing wheel path verbatim (WB-051 / backfill machinery).
- **`external_id`** = `group.group_key` for grouped tires (per-SKU-fallback groups keep `partNumber`). The
  `applyNewGroup` external-id fork ([`apply.ts:258-259`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L258-L259))
  already branches on product type; the tire branch switches to `group_key` when grouped.
- **Changed-group add path** ([`apply.ts:546-553`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L546-L553)):
  today it warns-and-skips added part numbers for tires. Teach it to add a new **size variant** to an existing
  tire product, reusing the wheel add-variant + adopt-by-SKU idempotency path.

A small tire grouping helper module (analogue of `wheel-grouping.ts`) houses the pure option/variant builders
(`buildTireProductOptions`, `buildTireVariantInput`, `buildTireGroupTitle`/`Handle`).

### 1e · Search transformer — tire branch in `build-search-document.ts`

Replace the `return null` at [line 36](../../../backend/src/modules/vendor-sync/search/build-search-document.ts#L36)
with a `product_type === "tire"` branch emitting a flat tire doc from variant metadata:

```
{ id, handle, title, thumbnail, created_at, product_type: "tire",
  brand, skus,
  tire_sizes,        // multi-valued canonical size strings (the size facet)
  rim_diameters,     // multi-valued int inches
  section_widths,    // multi-valued mm
  aspect_ratios,     // multi-valued
  load_indexes,      // multi-valued
  speed_ratings,     // multi-valued
  tire_type,         // derived: "passenger" | "light-truck" | "other"
  price_min, price_max }   // INTEGER CENTS (Math.round(major*100), same as wheels)
```

`tire_type` is a pure `classifyTireType`: prefix `LT` / inch-format → `light-truck`; prefix `P` / metric →
`passenger`; bias/ag → `other`. Non-tire, non-wheel products still fall to the minimal stub. The docblock's
"tires are a later spec" note is removed.

### 1f · Meili facet config — `medusa-config.js`

Add the tire fields to the shared `products` index (additive — simply absent on wheel docs, which Meili
handles). In [`medusa-config.js:253-268`](../../../backend/medusa-config.js#L253-L268):
- **filterableAttributes** `+= tire_sizes, rim_diameters, section_widths, aspect_ratios, load_indexes,
  speed_ratings, tire_type`
- **displayedAttributes** `+=` the same tire fields
- **sortableAttributes** (`price_min, created_at, title`) and **searchableAttributes**
  (`title, brand, skus`) already cover tires — no change.

### Testing (Sub-project 1) — Jest `pnpm test:sync`

- `extractTireModel` against `tire-model-golden.json` (all 11 real rows + edge/fallback vectors).
- `computeTireGroupKey`, `canonicalTireSize` (no-accidental-split), `classifyTireType`.
- Tire `buildSearchDocument` branch (asserts a real facet-bearing tire doc, not a stub).
- Update [`tire-normalize.test.ts:177`](../../../backend/src/modules/vendor-sync/__tests__/tire-normalize.test.ts#L177),
  which currently *locks in* the ungrouped `sku:F28840215` key, to expect the grouped key.
- The apply path is exercised via `pnpm vendor-sync:dry-run wheelpros-tires` in the plan's manual step (no
  live-DB unit test, same policy as wheels).

---

## Sub-project 2 · Tire discovery (next increment)

**Approach: extract a generic discovery engine, configure it per product type.** The Meili plumbing in
[`get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts) (multiSearch, disjunctive
facet counting, `unstable_cache` with empty-result self-heal) is product-type-agnostic. The wheel-specific
parts — the `product_type` scope, `FACET_FIELDS`, filter clauses, hit→product mapping — lift into a
**discovery config**; wheels are one config, tires another.

- **Route:** `/[countryCode]/(main)/tires` (mirrors `/store`), its own `page.tsx` + facet rail.
- **Tire facets:** Rim diameter (`rim_diameters`), Size (`tire_sizes`), Brand (`brand`), Tire type
  (`tire_type`).
- **Tire card:** brand + model, "N sizes", "from $X" (min variant price) — a `TireProductCard` sibling to the
  wheel card. `DiscoveryProduct` becomes a discriminated union (`wheel | tire`) to keep the hit-shapes honest.
- **No fit chip** (fitment deferred) — the FITS-YOUR-CAR chrome is wheel-only and simply isn't rendered.
- **Entry point:** a header-nav link to `/tires` (the one nav wiring in scope).

**Testing** — Vitest: the tire discovery config's filter-clause builder + hit→product mapper.

---

## Sub-project 3 · Tire PDP (final increment)

**Approach: the `/products/[handle]` route is shared; branch on `product_type`.** The loader returns a
discriminated `ProductDetail` (`wheel | tire`); the page renders the existing `WheelHero` or a new `TireHero`.

- **Loader branch** `mapTireDetail` — reads tire variant metadata (size, rim dia, section width, aspect, load
  index, speed, ply, construction, type) instead of wheel metadata.
- **Variant model = single Size axis**, surfaced as **rim-diameter chips gating a size list** — the direct
  analogue of the wheel's bolt-pattern-row-gates-the-size-grid pattern (pick 22″ → see the 305/45R22,
  285/45R22… available at 22″). Selecting a size resolves the variant.
- **Specs grid** — section width / aspect / rim / load index / speed / ply / construction / type, reusing
  `buildSpecRows` (already hides zero/missing rows, so ag tires with null width drop those rows honestly).
- **No finish selector, no bolt-pattern row, no fitment section.**
- **Add-to-cart / Buy Now** — resolve the selected-size variant id → existing `addToCart`. Qty default +
  low-stock threshold reuse `pdp-config.ts`. Cart / checkout / order flow are already generic → **zero new
  work** once a tire variant carries a price + inventory.

**Testing** — Vitest: the rim-diameter→size gating resolver + tire variant resolution for add-to-cart.

---

## Rollout / cutover

- **Sub-project 1 activation = the WB-059 cutover shape** (no wheel data touched): deploy backend → **restart**
  (picks up the new Meili index settings) → run a `wheelpros-tires` feed apply (grouped products created +
  indexed). Because grouping changes tire `external_id`s and existing tires are ungrouped one-per-SKU stubs,
  the **plan** will settle — against the real prod tire count — whether to purge existing tire products first
  (via the existing `purge-products` route scoped to the tire category) or let the diff reconcile.
- **Sub-projects 2 & 3:** storefront rebuild (the new `/tires` route + nav link are build-time). No migration
  anywhere.

## Out of scope

- **Tire fitment** — vehicle OEM tire-size matching / "fits your car" for tires. (wheel-size.com does return a
  vehicle's OEM tire sizes; a later spec can consume them.)
- **Pricing markup / MAP / margin** (WB-024) — tires import at MSRP like wheels do today; MAP/markup is a
  separate cross-catalog item.
- **Home merchandising / rails for tires** beyond the single nav entry-point link.

## Docs workflow

WB-005 stays `in-progress` until all three sub-projects land, then `done`. STATUS pillar rows updated (Vendor
import "tires not grouped/indexed" → grouped/indexed; a Discovery/PDP tire note). Each sub-project's spec/plan
moves `in-progress → done` as it merges. `/doc-review` before each doc-affecting commit.

## References

- Backlog: [WB-005](../../future/BACKLOG.md#L103-L110) · G6 in [BACKLOG Work groups](../../future/BACKLOG.md#L41)
- Prior art (mirror these): finish-as-variant [design](../../done/specs/2026-06-27-finish-as-variant-design.md)
  (WB-059 — group-key edit + cutover shape); wheel grouping
  [`wheel-grouping.ts`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts),
  [`group-key.ts`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts)
- Living reference: [vendor-sync-implementation](../../reference/vendor-sync-implementation.md)
