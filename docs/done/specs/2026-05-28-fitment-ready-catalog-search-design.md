# Fitment-Ready Catalog + Faceted Search — Design Spec

**Date:** 2026-05-28
**Status:** Approved (pending written-spec review)
**Plan reference:** [`STOREFRONT_PHASE2_PLAN.md`](../plans/2026-05-23-storefront-phase2.md) gaps 2.3 (search facets), and the substrate for 2.1 (fitment) / 2.2 (garage).

This is **Spec 1 of 2**. Spec 2 (the wheel-size.com fitment layer) is scoped separately and depends on this one.

---

## 1. Goal

Wire the already-built (chrome-complete, mock-data) Wheel Builds storefront to the real Medusa catalog, and stand up functional faceted search for wheels — built **deliberately as the substrate for vehicle-fitment filtering**.

The end-state product goal (delivered across Spec 1 + Spec 2): a shopper enters their vehicle, we look up that vehicle's wheel spec from wheel-size.com, and we show **only wheels that physically fit it**. This spec delivers everything *except* the wheel-size.com call and the fitment match itself — but it indexes the catalog in the exact canonical form that fitment matching will consume, so Spec 2 is a thin filter-derivation layer rather than a new subsystem.

### The fitment model this enables (spec-match / parametric)

wheel-size.com's `by_model` lookup returns *the vehicle's* wheel spec. We already store the same dimensions on every wheel. So "does this wheel fit?" is a parametric comparison, not a lookup table:

```
vehicle (wheel-size.com)             wheel (our catalog)
  bolt pattern  5x114.3        ==     bolt_patterns_canonical   (exact — hard gate)
  hub bore      64.1mm         <=     center_bore_mm            (wheel bore must be >=; hub ring steps down)
  diameter      17-20" (OEM+)  contains  wheel_diameter_in      (within safe-fit window)
  offset        ET35 +/- N     ~       offset_mm                (within tolerance window)
  width         7-9"           contains  wheel_width_in         (within safe-fit window)
```

Because Meilisearch can filter on these indexed arrays, "show only wheels that fit this car" becomes just another filter expression. The search engine we stand up for browsing **is also** the fitment engine — no extra infrastructure.

---

## 2. Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | First sub-project | Catalog wiring + search (foundational, no wheel-size.com dependency) |
| D2 | Product scope | **Wheels only.** Tires get their own spec (need a grouping rule + different facet axes). |
| D3 | Results surface | **Discovery (`/store`) is the single results surface.** Text search + YMM both land there; legacy `/results/[query]` retired. |
| D4 | Verification environment | Live dev DB + Meilisearch with real synced wheels (strongest "done" bar). |
| D5 | Discovery data source | **Approach 1:** Meilisearch (facets/search/sort) for Discovery; Medusa Store API for PDP (live price/stock). |
| D6 | Fitment pattern | **Parametric spec-match** (vehicle spec -> filter), not per-SKU fitment tables. |
| D7 | Fit strictness | **Safe-fit window:** exact bolt pattern + hub-bore<=wheel-bore are hard gates; diameter/width/offset within wheel-size.com's safe aftermarket window. (Applied in Spec 2; index must carry the fields now.) |
| D8 | Packaging | **Staged:** this spec = fitment-ready catalog + search; Spec 2 = wheel-size.com client + cache + matching + persistent garage. |
| D9 | Pricing | Display **MSRP** (`variant.calculated_price`). MAP stays in metadata, enforcement deferred to plan gap 2.6 (blocked on dealer-agreement legal question). |

---

## 3. Architecture & data flow

```
vendor-sync (already built)
   |-> Medusa catalog: 1 product = brand+style+finish, N variants (BoltPattern x Diameter x Width x Offset)
         - product.metadata:  brand, finish, display_style_no, style, product_type, group_key
         - variant.metadata:  wheel_diameter_in, wheel_width_in, bolt_count, bolt_circle_in,
                               bolt_pattern_raw, offset_mm, center_bore_mm, load_rating_lb, vendor_map_usd
         - variant.prices:    MSRP (USD)
                    |
        +-----------+------------+
        v                        v
 Meilisearch (transformer)    Medusa Store API (live)
   flattens variants ->         getProductByHandle
   facet + fitment arrays
   per product
        |                        |
        v                        v
 Discovery /store             PDP /products/[handle]
  (facets + grid + search       (full detail, live price/stock)
   + vehicle-constraint hook)
```

**Two read paths, by purpose.** Discovery (browse / filter / search / sort + facet counts) reads Meilisearch. PDP (authoritative detail) reads Medusa directly so price/stock are always live. The index may lag the DB by up to one sync cycle — acceptable for the grid, never shown as the source of truth on PDP.

**Re-indexing is automatic.** vendor-sync uses Medusa core product workflows, which emit the product events the `@rokmohar/medusa-plugin-meilisearch` plugin already subscribes to. This requires `shared` or `worker` WORKER_MODE (Railway uses these; the plugin's server-only caveat is noted in §8).

---

## 4. Backend — Meilisearch index schema + transformer

File: [`backend/medusa-config.js`](../../../backend/medusa-config.js) — the plugin block at ~line 165-186 (currently `fields: ['id','title','description','handle','variant_sku','thumbnail']`, `filterableAttributes: ['id','handle']`).

The facet/fitment axes live on **variant** metadata, but the index is **per product**. The plugin (v1.3.5) supports a `transformer: (product, defaultTransformer?, options?)` hook. We:

1. Widen the product `fields` so the transformer receives `variants` + `metadata`.
2. Add a `transformer` that flattens each product's variants into aggregated arrays + a price snapshot.
3. Set `filterableAttributes` / `sortableAttributes` / `searchableAttributes`.

### Indexed document shape (per wheel product)

| Field | Type | Source | Purpose |
|---|---|---|---|
| `id`, `handle`, `title`, `thumbnail` | scalar | product | display + routing |
| `brand` | string | `product.metadata.brand` | facet + filter |
| `finish` | string | `product.metadata.finish`, normalized -> `black\|bronze\|silver` (see §5 G1) | facet + filter |
| `diameters` | number[] | distinct `variant.metadata.wheel_diameter_in` | facet + filter + fit window |
| `widths` | number[] | distinct `variant.metadata.wheel_width_in` | PDP size matrix + fit window (NOT a Discovery facet — no width filter in the rail) |
| `bolt_patterns` | string[] | distinct `variant.metadata.bolt_pattern_raw` (display form) | facet + filter |
| `bolt_patterns_canonical` | string[] | derived from `bolt_count` + `bolt_circle_in` -> `"{count}x{pcd_mm}"` | **fitment hard gate** |
| `offsets` | number[] | distinct `variant.metadata.offset_mm` | filter + fit window |
| `center_bores` | number[] | distinct `variant.metadata.center_bore_mm` | **fitment hub-bore gate** |
| `price_min` / `price_max` | number (cents) | min/max MSRP across variants | sort + price range + "from" price |
| `created_at` | timestamp | product | "newest" sort + `isNew` derivation |
| `product_type` | string | `"wheel"` | guard — excludes tires from this index cut |

- **`filterableAttributes`:** `brand, finish, diameters, widths, bolt_patterns, bolt_patterns_canonical, offsets, center_bores, price_min, price_max, product_type`
- **`sortableAttributes`:** `price_min, created_at`
- **`searchableAttributes`:** `title, brand, variant_sku`

Array filterables give correct semantics: filtering "20-inch" matches any product with a 20" variant.

### Canonical bolt-pattern normalizer (the make-or-break unit)

A pure function, written **once in this spec** and reused verbatim on the wheel-size.com side in Spec 2 — this is what guarantees the two formats meet.

- Canonical form: `"{boltCount}x{pcdMm}"` where `pcdMm` is `bolt_circle_in * 25.4`, rounded to one decimal and snapped to the nearest standard PCD value (114.3, 120, 127, 130, 139.7, ...). Example: `5x114.3`, `6x139.7`.
- Dual-drilled wheels (`bolt_pattern_raw` like `6X135/5.5`) produce **multiple** canonical entries -> hence `bolt_patterns_canonical` is an array.
- Lives in the backend (`backend/src/...`), unit-tested with jest (the backend already has `pnpm test:sync`). Test against known vendor strings and their expected canonical output, including the wheel-size.com target format.

### One-time reindex

After the config change, existing products must be backfilled into Meilisearch (events only fire on future writes). Use the plugin's reindex mechanism (or a one-shot script) — documented as an explicit implementation step.

---

## 5. Field mapping — storefront types <-> backend

`ProductDetail extends DiscoveryProduct`, so this covers both. Types: [`discovery/data/types.ts`](../../../storefront/src/modules/discovery/data/types.ts), [`product-detail/data/types.ts`](../../../storefront/src/modules/product-detail/data/types.ts).

### Clean maps — Discovery grid

| Storefront field | Backend source |
|---|---|
| `id`, `handle`, `name` (title), `brand` | product / index |
| `priceCents` | `price_min` (the "from" price) |
| `diameter`, `width`, `boltPattern` | representative variant (lowest-diameter variant of the product) |

### Clean maps — PDP-specific

| Storefront field | Backend source |
|---|---|
| `sizeOptions` | one entry per Diameter x Width variant combo; offsets -> `offsetVariants`, `inventory_quantity` -> `availability`, MSRP -> `priceCentsOverride` |
| `specs.centerBoreMm / loadRatingLb / weightLb` | variant metadata (`center_bore_mm`, `load_rating_lb`, `weight`) |
| `specs.construction / countryOfOrigin / warranty` | not in vendor data -> static defaults / `""` (graceful; plan gap 4.1 for construction) |
| `boltPatternOptions` | distinct `bolt_pattern_raw` across variants |
| `finishOptions` | normalized finishes present for the product (often one, since finish is part of the group key) |
| `relatedHandles` | same `collection_id` (brand collection) |
| `fitment` | **`[]`** — Spec 2; the Fitment section already degrades gracefully on empty |

### The 4 gaps with no backend source — resolutions

- **G1 — `finish` enum mismatch.** Storefront uses 3-value `black\|bronze\|silver` (wired to `<Wheel>` render, `FINISH_SWATCH`, `FINISH_LABELS`); vendor finish is free text ("Gloss Black", "Machined", ...). **Resolution:** a normalization map (vendor string -> nearest of the 3 buckets, default `black`) applied in the transformer. Keep the raw vendor finish in product metadata for later. UI stays unchanged.
- **G2 — `categories` facet** (`off-road / luxury / street / truck-dually / drag / utv`). No backend source (backend only has a "wheels" category). **Resolution:** hide the Category facet section for this cut (return empty facet) rather than fake-derive it. Revisit when a real classification exists (relates to plan gap 4.4).
- **G3 — `isNew` / `originalPriceCents`.** No "new" flag; no sale price (MSRP only). **Resolution:** derive `isNew` from `created_at` within N days (default 30); omit `originalPriceCents` entirely.
- **G4 — `fitsActiveVehicle`.** Pure fitment. **Resolution:** leave unset — Spec 2.

---

## 6. Storefront — Discovery adapter

File: [`storefront/src/modules/discovery/data/get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts) (the integration seam at ~line 81). Keep all types stable so no consumer changes.

- Rewrite `getDiscoveryProducts(query)` to query Meilisearch via the existing client ([`search-client.ts`](../../../storefront/src/lib/search-client.ts)):
  - Build the `filter` expression from `DiscoveryFilters` (brand / finish / diameters / boltPatterns / price range). Note: `DiscoveryFilters` has **no width filter** — width is indexed for fitment/PDP but not exposed as a browse facet.
  - `sort` from `sortableAttributes`; paginate (`DEFAULT_PAGE_SIZE`).
  - Request `facets`; map `facetDistribution` -> the existing `FacetCounts` shape. Use **disjunctive faceting** (each facet counted with the *other* filters applied), as the file's own comment already calls for.
- **Add an optional `vehicleConstraint` to `DiscoveryQuery`** — a filter fragment (bolt pattern + bore + diameter/width/offset ranges). In this spec it is always empty and unused; it is the seam Spec 2 fills. Manual facets work with or without it.
- Map hits -> `DiscoveryProduct` (per §5).
- Delete `getDiscoveryFacets`, `mock-facets.ts`, `mock-products.ts` once real.
- `parseQueryFromSearchParams` and `useDiscoveryQuery` (URL-param plumbing) are unchanged.

---

## 7. Storefront — PDP adapter

File: [`storefront/src/modules/product-detail/data/get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts). Types stay stable.

- Rewrite `getProductDetail(handle)` to call `getProductByHandle(handle, region.id)` from [`lib/data/products.ts`](../../../storefront/src/lib/data/products.ts) (live Medusa — authoritative price/stock). Region resolution per the legacy `modules/store/templates/paginated-products.tsx` reference.
- Map Medusa product + variants -> `ProductDetail` (per §5): variants -> `sizeOptions` grouped by Diameter x Width; offsets -> `offsetVariants`; `inventory_quantity` -> `availability`.
- `getRelatedProducts` -> `getProductsList` filtered by `collection_id`.
- `fitment: []` (Spec 2).
- Restore `generateStaticParams` + `notFound()` for unknown handles in [`products/[handle]/page.tsx`](../../../storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx) (today every handle resolves to mock).

---

## 8. Search routing

- Point the search drawer submit + the YMM/garage "Find My Fit" flows at **`/store?q=...`** (Discovery), wiring `q` into the Meilisearch text query. Files: [`actions.ts`](../../../storefront/src/modules/search/actions.ts), [`ymm-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx), [`garage-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx).
- Retire / redirect the legacy `/results/[query]` route and its `SearchResultsTemplate`.
- Delete the orphaned reference dirs the storefront CLAUDE.md flags as deletable post-swap: `modules/store/`, `modules/products/` (verify nothing imports them first).

---

## 9. Units, isolation, errors, testing

### Units (each understandable + testable in isolation)
- **Backend transformer** — pure `(product -> indexed doc)`. Depends only on product+variant shape.
- **Bolt-pattern normalizer** — pure `(boltCount, boltCircleIn | raw) -> canonical[]`. Its own jest unit (the highest-risk unit; tested against known vendor<->wheel-size pairs).
- **Finish normalizer** — pure `(vendorFinish -> Finish)`. Unit-tested.
- **Storefront Discovery adapter** — `(query -> Meilisearch -> DiscoveryResult)`. The mapping `hit -> DiscoveryProduct` is a pure helper.
- **Storefront PDP adapter** — `(handle -> Medusa -> ProductDetail)`. The mapping `product -> ProductDetail` is a pure helper.

### Error handling
- Meilisearch unreachable -> Discovery renders the existing empty state, not a crash.
- Unknown handle -> `notFound()`.
- Missing metadata field -> safe defaults (finish -> `black`, numeric arrays -> `[]`, specs -> `""`/0).

### Verification (against the live dev DB + Meilisearch — D4)
1. Reindex; assert real synced wheels appear in `/store`.
2. Each facet (brand / diameter / bolt pattern / finish / price) narrows the grid, with correct disjunctive counts.
3. Sort (price asc/desc, newest) works.
4. A PDP renders real specs / size matrix / live price / stock from Medusa.
5. Text search from the drawer lands on `/store?q=` with relevant hits.
6. jest: bolt-pattern normalizer + finish normalizer unit tests pass (`pnpm test:sync` style).

---

## 10. Fitment-readiness seam (for Spec 2)

This spec leaves exactly these hooks so Spec 2 is a thin layer:
- `bolt_patterns_canonical` + `center_bores` + `diameters`/`widths`/`offsets` already indexed and filterable.
- The canonical bolt-pattern normalizer is shippable as a shared util for the wheel-size side.
- `DiscoveryQuery.vehicleConstraint` exists (empty here) — Spec 2 populates it from the cached vehicle spec.
- The garage abstraction ([`lib/garage/`](../../../storefront/src/lib/garage/)) stays localStorage in this spec; Spec 2 swaps the singleton to `MedusaGarage`.

**Spec 2 scope (NOT this spec):** wheel-size.com API client, lazy-cache table (human-initiated calls only, per TOS), spec->filter translation applying the safe-fit window (D7), persistent garage, PDP "fits these vehicles," and the Discovery "only show wheels that fit" toggle.

---

## 11. Explicitly out of scope (this spec)

Tires (D2); the wheel-size.com client / cache / matching / filtering (Spec 2); persistent garage (Spec 2); MAP enforcement (gap 2.6); wheel construction / image galleries / reviews / SEO (Tier 4); shipping / tax / drop-ship (Tier 1/3).

---

## 12. Risks / notes

- **Bolt-pattern format drift** is the single highest risk: if the canonical normalizer and wheel-size.com's format disagree, fitment silently returns nothing in Spec 2. Mitigation: define canonical form here, unit-test it, and validate against ~5 known vehicles' wheel-size responses as the first task of Spec 2.
- **Plugin worker mode:** the Meilisearch plugin's event subscribers need `shared`/`worker` mode. Confirm the target environment's `WORKER_MODE`.
- **`.medusa/server` stale-config trap:** after editing `medusa-config.js`, clear `backend/.medusa/server` before restart (CLAUDE.md gotcha) or the new index settings won't take effect.
- **Price in the index is a snapshot** refreshed on sync; PDP shows live price, so the only divergence is a possibly-stale "from" price on the grid for up to one sync cycle.
