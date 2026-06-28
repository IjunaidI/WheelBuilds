# Finish as a variant axis (collapse colors into one product) — Design

> Date: 2026-06-27. Status: done (merged + prod cutover run 2026-06-27: 1,724 groups / 29,445 variants / 0 errors). Pillar: Vendor import + PDP + Discovery. Backlog: **WB-059**.
> Wheels that are identical except for color/finish should be ONE product with selectable finish
> variants, not N separate products. `/products/petrol-p3b-matte-black` + `…-gloss-silver` →
> one `/products/petrol-p3b` where the buyer picks Matte Black / Gloss Silver.
>
> **WB-051-sized**: one cohesive feature, large blast radius (vendor-sync grouping + metadata + images
> + Meilisearch transformer + Discovery + PDP + a full prod re-import). Built across phases; the
> destructive prod re-import is a single gated cutover at the very end.

## Context

The vendor-sync pipeline groups wheel CSV rows into Medusa products. The group key —
[`computeWheelGroupKey`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts) —
is `${brand}|${displayStyleNo}|${finish}` (per-SKU `sku:${partNumber}` when there's no
DisplayStyleNo). Because **finish is in the key**, every color of the same model becomes a separate
product, with finish baked into the title/handle
([`buildGroupTitle`/`buildGroupHandle`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts))
and stored as **product-level** metadata
([`buildProductMetadata`](../../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts)).

Variants within a product are today keyed by a **6-axis** tuple — bolt pattern × diameter × width ×
offset × center bore × load rating
([`variantAxisKey`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts), WB-051).
Finish is NOT an axis because each product was a single finish.

**The fix is structurally small but wide:** drop finish from the group key (colors collapse into one
group) and promote finish to a **7th variant axis** (so two rows identical except for finish become
distinct variants instead of being deduped as "exact duplicates"). Then the Meilisearch transformer,
Discovery, and the PDP must treat finish as a per-variant, multi-valued property rather than a
single product attribute.

**Decisions made in brainstorming:**
- **PDP finish values = raw vendor finishes** ("Matte Black", "Gloss Silver", "Gloss Black Milled") —
  distinct variants. Discovery's filter rail keeps the **3 normalized buckets** (black/silver/bronze),
  now multi-valued per product (a wheel appears under every bucket its finishes map to). Raw keeps
  matte-vs-gloss distinct; normalizing on the PDP would wrongly re-merge two real colors.
- **Old per-finish URLs 404** (no redirect map) — the catalog is freshly re-imported, low SEO exposure.

**Design principle:** the change is driven by ONE group-key edit; everything else propagates finish
as data. Pure helpers stay unit-tested; no in-place data migration (re-group = re-import).

---

## Part 1 · Backend grouping (vendor-sync)

### 1a · Drop finish from the group key (the driver)
[`group-key.ts`](../../../backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts):
`return \`${brand}|${displayStyleNo}\`` (finish removed). Per-SKU fallback unchanged. After this, all
finishes of a Brand+DisplayStyleNo share one `groupKey` → one Medusa product.

### 1b · Finish becomes the 7th variant axis
[`wheel-grouping.ts`](../../../backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts):
- `WHEEL_OPTION_TITLES` gains `FINISH: "Finish"`.
- `variantAxisKey` appends the **raw finish** (a blank finish → the existing `OPTIONAL_AXIS_NONE`
  sentinel `—`) so a matte-black and a gloss-silver row at the same size/bolt/offset/bore/load are
  DISTINCT variants, never deduped. Two genuinely-different raw finishes that happen to normalize to
  the same bucket (matte black vs gloss black) also stay distinct.
- `buildProductOptions` adds a **Finish** option = the union of raw finishes in the group.
- `buildVariantOptions` adds `[WHEEL_OPTION_TITLES.FINISH]: finish-or-sentinel`.
- `axisKeyFromMetadata` appends the variant's `finish` metadata (read with the same blank→sentinel
  rule) so the changed-group incremental add path dedupes correctly against existing variants.
- `buildGroupTitle` / `buildGroupHandle` **drop finish** → `Petrol P3B` / `petrol-p3b`.

`pickGroupRepresentative` is unchanged (still picks one rep for product-level title/handle/weight),
but the rep's finish no longer affects the handle.

### 1c · Finish + per-finish image move to the variant
[`build-metadata.ts`](../../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts):
- `buildProductMetadata` — **remove** `finish` (no longer product-constant). Keep brand /
  display_style_no / style / group_key.
- `buildVariantMetadata` — **add** `finish` (raw) and **`image_url`** (the row's own vendor image).
  Each finish carries its own CDN image so the PDP can swap the photo per finish.

### 1d · Product images span finishes
[`apply.ts`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts) `applyNewWheelGroup`:
- product `thumbnail` = the **representative finish's** image (rep = in-stock-first then lowest
  part#, matching the existing dedupe survivor rule).
- product `images` = the union of distinct finish image URLs in the group (so all finish photos are
  attached to the product).
- each variant's `metadata.image_url` is its own image (from 1c).
The changed-group add path (`persist…`/adopt) keeps working — it now dedupes on the 7-axis tuple via
the updated `axisKeyFromMetadata`.

**Edge cases:**
- *Blank finish* (e.g. the Asanti 172 case): finish axis value = `—`; a product whose only finish is
  blank shows no Finish selector (single-value axis, hidden on the PDP) → behaves exactly like today.
- *Mixed blank + named finishes in one group*: blank becomes a `—` finish variant alongside named
  ones (admin can clean up later); not fabricated, just surfaced.

---

## Part 2 · Search index (Meilisearch)

[`build-search-document.ts`](../../../backend/src/modules/vendor-sync/search/build-search-document.ts):
- `finish` (single, from product metadata) → **`finishes`**: an array = the union of the variants'
  **normalized** buckets (`normalizeFinish` over each variant's raw `finish`), deduped.
- The doc keeps one product = one row (now multi-finish). `thumbnail` stays the product thumbnail
  (rep finish). Price min/max already span variants — unchanged.

[`medusa-config.js`](../../../backend/medusa-config.js) products `indexSettings`: replace `finish`
with `finishes` in `filterableAttributes` (and any `facets`/`displayedAttributes` that referenced
`finish`). Activates on the next Meili settings re-sync (plugin pushes settings on boot) — folded
into the cutover.

---

## Part 3 · Discovery (storefront)

- [`discovery/data/types.ts`](../../../storefront/src/modules/discovery/data/types.ts):
  `DiscoveryProduct.finish: Finish` → `finishes: Finish[]`; `FacetCounts.finishes`; the parser/URL
  param stays `finishes` (already plural in the URL).
- [`discovery/data/get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts):
  `FACET_FIELDS` finish entry → `finishes`; `hitToProduct` reads the `finishes` array; `buildFilters`
  targets `finishes`. A wheel in black+silver matches both buckets (disjunctive facet logic
  unchanged).
- **filter-rail** finish section + **product card** swatch row read `product.finishes` (real set) —
  the card stops padding with `["black","silver"]` filler.

## Part 4 · PDP finish selector (storefront)

The PDP already owns finish state and renders a finish swatch in the gallery — today
`finishOptions` is hardcoded to a single entry. Make finish a real outer selector.

- [`product-detail/data/types.ts`](../../../storefront/src/modules/product-detail/data/types.ts):
  introduce `FinishOption = { raw: string; normalized: Finish; imageUrl: string | null; sizeOptions:
  SizeOption[] }`. `ProductDetail.finishOptions: FinishOption[]`.
- [`product-detail/data/get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts):
  partition variants by **raw finish**; for each finish run the existing `groupVariantsIntoSizes`
  over that partition → `FinishOption.sizeOptions`; `imageUrl` = a variant's `metadata.image_url`
  for that finish (fallback to product thumbnail). Default finish = rep (in-stock-first). Top-level
  `priceCents`/lead image come from the default finish.
- [`hero/index.tsx`](../../../storefront/src/modules/product-detail/components/hero/index.tsx): add
  the selected **finish** to the state machine; switching finish swaps the active
  `FinishOption.sizeOptions`, image, and price, and re-snaps size/offset/bore/load to a valid leaf in
  the new finish (reuse `pickDefaultSize`/`resolveLeafVariant`).
- [`gallery.tsx`](../../../storefront/src/modules/product-detail/components/hero/gallery.tsx): the
  finish swatch row lists the real finishes (label + each finish's `imageUrl`); selecting drives the
  hero state and shows that finish's photo (real `next/image`, `<Wheel>` fallback).
- Single-finish products: hide the Finish selector (same convention as single-value bore/load axes)
  → identical to today's PDP.

The pure variant model (`group-sizes.ts`) is reused as-is, just invoked per-finish — the only new
pure logic is the finish partition (unit-tested).

---

## Part 5 · Cutover (ops) — once, at the end

Re-grouping cannot be done in place; it's the WB-051 dance against prod (`trolley.proxy.rlwy.net`):
1. `POST /admin/vendor-sync/purge-products` (looped until `remaining:0`).
2. `vendor-sync-truncate-state.ts -- --confirm-host=<host>` (single TRUNCATE).
3. `POST /admin/vendor-sync/runs {vendor_code, dry_run:false}` (re-stage + re-diff + apply with the
   new grouping).
4. Meili settings + docs re-sync (the `finishes` facet activates).

Result: product count **drops** (colors merge), variant count **rises**; wheel handles lose the
finish suffix; old `…-<finish>` URLs 404. **Both code halves (backend + storefront) merge BEFORE the
cutover** so prod stays on the working per-finish catalog until a single switch — prod never serves a
half-migrated state. The destructive step is user-gated (you run it, or I do on explicit go-ahead).

---

## Sequencing (for the plan)
1. Backend grouping (1a–1d) + pure-fn tests.
2. Meili transformer + `medusa-config` index settings (Part 2).
3. Discovery (Part 3).
4. PDP finish selector (Part 4).
5. Cutover (Part 5) — last, gated.

Phases 1–4 are code+tests (mergeable, prod untouched). Phase 5 is the live switch.

## Out of scope (explicit)
- Old-URL redirects (404 chosen).
- Per-finish pricing rules / per-finish stock display nuances beyond what the variant model already does.
- Tire finishes (tires still one-product-per-row).
- Real photography beyond the vendor CDN images already passed through.
- Admin cleanup of mixed blank/named finish groups.

## Verification
- **Backend (jest):** `computeWheelGroupKey` drops finish (two finishes → same key; per-SKU
  unchanged); `variantAxisKey`/`buildProductOptions`/`buildVariantOptions`/`axisKeyFromMetadata`
  treat finish as an axis (matte-black vs gloss-silver at same size = distinct; matte vs gloss black
  distinct; blank → sentinel); `buildGroupHandle`/`buildGroupTitle` drop finish;
  `build-search-document` emits `finishes` as the normalized union. `pnpm test:sync`.
- **Storefront (vitest):** the finish-partition helper (variants → FinishOption[] with per-finish
  sizeOptions); discovery `finishes` mapping. `npx tsc --noEmit` 0 new vs the 14 pre-existing.
- **Config:** `node --check medusa-config.js`.
- **Deferred to the cutover (live):** a known multi-color model (e.g. Petrol P3B) imports as ONE
  product at `/products/petrol-p3b` with a working finish selector (image + price + sizes change per
  finish); Discovery shows it under each of its normalized buckets; old `…-matte-black` URL 404s;
  apply `errors` ≈ 0; product count drops / variant count rises vs the prior import.

## File inventory
**Backend — modified**
- `adapters/wheelpros-wheels/group-key.ts` (drop finish) + its test
- `pipeline/wheel-grouping.ts` (Finish axis: titles/axisKey/options/variantOptions/axisKeyFromMetadata; title+handle drop finish) + tests
- `pipeline/build-metadata.ts` (finish+image_url → variant; finish off product) + tests
- `pipeline/apply.ts` (thumbnail=rep image, images=union, variant image_url)
- `search/build-search-document.ts` (`finishes` array) + test
- `medusa-config.js` (index settings `finish`→`finishes`)
- `docs/reference/vendor-sync-implementation.md` (document the 7-axis model + finish grouping)

**Storefront — modified**
- `modules/discovery/data/types.ts` (`finishes: Finish[]`)
- `modules/discovery/data/get-products.ts` (facet + hit mapping)
- `modules/discovery/components/filter-rail/*` + `grid/product-card.tsx` (read `finishes`)
- `modules/product-detail/data/types.ts` (`FinishOption`, `finishOptions`)
- `modules/product-detail/data/get-product.ts` (per-finish partition) + a new pure helper + test
- `modules/product-detail/components/hero/index.tsx` (finish in state machine)
- `modules/product-detail/components/hero/gallery.tsx` (real finish swatches + per-finish image)
- `storefront/CLAUDE.md` (PDP finish-as-variant note)

**Ops (Part 5, no new files)** — `purge-products` route + `vendor-sync-truncate-state.ts` + a feed re-run.
