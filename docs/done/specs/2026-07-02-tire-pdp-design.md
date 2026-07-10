# Tire store — Sub-project 3: Tire PDP — Design

> Date: 2026-07-02. Status: in-progress. Pillar: PDP (storefront). Backlog: **WB-005** (SP3 of 3 — final build piece).
> SP1 (backend grouping + indexing) + SP2 (tire discovery `/tires`) are merged. This sub-project gives tires a
> **product-detail page**: a customer clicks a tire card → lands on `/products/<handle>` → picks a size → adds to
> cart. Parent design: [2026-07-02-tire-store-design.md](2026-07-02-tire-store-design.md) §4.

## Context

The `/products/[handle]` route is SHARED — a tire product's handle resolves there just like a wheel's (Medusa
handles are unique across product types). Today the whole PDP is wheel-modeled and **never reads
`product.metadata.product_type`**:

- The loader [`get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts) `mapToDetail`
  builds a wheel `ProductDetail` (finish × size × offset × bolt-pattern × bore × load axes) and calls
  `getFitmentByProduct`; `getRelatedProducts` returns wheel-shaped `DiscoveryProduct[]` by same-brand collection.
- [`types.ts`](../../../storefront/src/modules/product-detail/data/types.ts): `ProductDetail extends DiscoveryProduct`
  (wheel-shaped, **no discriminant**). The route [`page.tsx`], template, hero, specs, fitment, and related sections
  are all typed to that shape.
- The cart `addToCart({ variantId, quantity, countryCode })`
  ([`lib/data/cart.ts`](../../../storefront/src/lib/data/cart.ts)) is product-type-agnostic and reused verbatim.

A tire Medusa product has ONE option "Size" with values like `"305/45R22 118S"`; each variant carries metadata
`size_label, canonical_size, tire_width_mm, aspect_ratio, construction_type, rim_diameter_in, load_index,
speed_rating, ply_rating` + product metadata `tire_prefix, vendor_division, brand, product_type:"tire"`. **No
storefront code reads any of these variant-metadata keys yet.** SP2 already produced `TireDiscoveryProduct` +
`TireProductCard` + `getTireDiscoveryProducts` at [`modules/tire-discovery/`](../../../storefront/src/modules/tire-discovery/).

## Decisions made in brainstorming

- **Branch the shared route; keep the wheel PDP byte-untouched.** The branch is unavoidable (shared route), so
  THREE shared files get a minimal dispatch edit — `get-product.ts` (read `product_type` at the `:98` seam →
  delegate to `mapTireDetail`), `types.ts` (a `kind: "wheel" | "tire"` discriminant + a `ProductDetail |
  TireProductDetail` union), and `page.tsx` (branch on `kind` → the wheel template or a new `TireDetailTemplate`).
  The wheel **mapping, hero, template, specs, fitment, and related stay unchanged.** Everything else is NEW
  parallel code. (Mirrors the SP2 parallel-module philosophy within the constraint of a shared route.)
- **Size selector = rim-diameter chips gating a size list** (owner-chosen). Rim chips (17/18/20/22) filter the
  sizes available at that rim; picking a size resolves the cart variant. Rim chips auto-hide when the model has ≤1
  rim. The direct analog of the wheel PDP's bolt-pattern-row-gates-the-size-grid.
- **No fitment** — the tire PDP renders NO fitment section, finish selector, bolt-pattern row, or garage/fit chrome.
- **Related = SP2 reuse.** `getRelatedTireProducts(brand, excludeHandle)` wraps SP2's `getTireDiscoveryProducts`
  filtered by brand → `TireProductCard`. Reuses the tested Meili path + card; throw-safe + empty pre-cutover.
- **Specs = model-level.** `buildTireSpecRows` shows construction type, tire type, ply rating, weight (zero-hidden,
  reusing the existing zero-hiding pattern). Per-size numbers (width/aspect/rim/load/speed) vary by size, so they
  live in the size label + a small readout in the hero — NOT a static model-level grid row (which would be wrong
  for other sizes).
- **Qty default** — a new `NEXT_PUBLIC_PDP_TIRE_DEFAULT_QTY` (default 4, env-overridable), not the wheel-branded
  `DEFAULT_WHEEL_QTY`.

**Design principle:** the tire PDP is a parallel detail surface behind a thin `kind` discriminant; the wheel PDP is
untouched. Pure helpers (size grouping, spec rows, variant resolution) are unit-tested; the loader reuses the
generic price/stock/weight/thumbnail primitives and the generic `addToCart`.

## Architecture

```
storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx   (EDIT: branch on kind)
storefront/src/modules/product-detail/
  data/
    types.ts            (EDIT: + kind discriminant on ProductDetail; + TireProductDetail, TireSizeOption,
                          TireSpecs; + AnyProductDetail = ProductDetail | TireProductDetail)
    get-product.ts      (EDIT: getProductDetail reads product_type → mapTireDetail; returns AnyProductDetail.
                          wheel mapToDetail gains `kind:"wheel"`. New getRelatedTireProducts.)
    tire/
      map-tire-detail.ts     mapTireDetail(product) → TireProductDetail  (pure over the fetched product)
      tire-size-options.ts   buildTireSizeOptions(variants) → TireSizeOption[]  (pure)
      tire-spec-rows.ts      buildTireSpecRows(specs) → SpecRow[]  (pure, zero-hidden)
      classify-tire-type.ts  classifyTireType(prefix, rep) → "passenger"|"light-truck"|"other"  (pure)
    pdp-config.ts       (EDIT: + DEFAULT_TIRE_QTY from NEXT_PUBLIC_PDP_TIRE_DEFAULT_QTY, default 4)
  components/tire/
    breadcrumb.tsx      Tires → brand → name
    hero/index.tsx      client: rim chips → size list → variant resolution; gallery + purchase panel
    hero/gallery.tsx    big product image (no finish switcher)
    hero/size-picker.tsx    rim chips + size list + selected-size spec readout
    hero/purchase-panel.tsx qty stepper + Add to cart + Buy Now (reuse addToCart), no fitment chip
    specs.tsx           model-level tire specs grid (buildTireSpecRows)
    related.tsx         "Similar tires" → TireProductCard (getRelatedTireProducts)
  templates/tire-detail.tsx   composes breadcrumb + hero + specs + related (NO fitment)
```

### Types (`types.ts` edits)

```
// discriminant on the existing wheel type (default it in mapToDetail):
ProductDetail = DiscoveryProduct & { kind: "wheel"; ... existing ... }

TireSizeOption = {
  sizeLabel: string          // "305/45R22 118S" (variant option value)
  canonicalSize: string      // "305/45R22"
  rimDiameterIn: number
  sectionWidthMm: number | null
  aspectRatio: number | null
  loadIndex: number | null
  speedRating: string | null
  plyRating: string | null
  constructionType: string | null
  variantId: string          // cart line item id
  priceCents: number
  availability: "in_stock" | "low_stock" | "out_of_stock"
}

TireSpecs = { construction: string | null; plyRating: string | null;
              tireType: "passenger" | "light-truck" | "other"; weightLb: number }

TireProductDetail = {
  kind: "tire"
  id, handle, brand, name, description: string
  thumbnail: string | null
  priceCents: number         // "from" = min non-zero variant price
  tireType: "passenger" | "light-truck" | "other"
  rimDiameters: number[]     // sorted distinct
  sizeOptions: TireSizeOption[]
  specs: TireSpecs
}

AnyProductDetail = ProductDetail | TireProductDetail
```

### Loader (`get-product.ts` edits + `data/tire/*`)

`getProductDetail(handle): Promise<AnyProductDetail>` — after `getProductByHandle` (unchanged; tire variant
metadata arrives via default fields), read `product.metadata?.product_type`. If `"tire"`, `return
mapTireDetail(product)` (no `getFitmentByProduct` call). Else the existing wheel path (+ `kind:"wheel"`).

`mapTireDetail(product)` (pure):
- `brand = pmeta.brand`, `name = title`, `description`, `thumbnail`.
- `sizeOptions = buildTireSizeOptions(product.variants)`: per variant → `{ sizeLabel: metadata.size_label,
  canonicalSize: metadata.canonical_size, rimDiameterIn: num(metadata.rim_diameter_in), sectionWidthMm, aspectRatio,
  loadIndex, speedRating, plyRating, constructionType, variantId: v.id, priceCents:
  Math.round(v.calculated_price.calculated_amount*100), availability: availabilityOf(v.inventory_quantity,
  LOW_STOCK_THRESHOLD) }`. Sorted by rim then width then aspect.
- `rimDiameters` = sorted distinct rimDiameterIn.
- `priceCents` (from) = min non-zero across sizeOptions.
- `tireType = classifyTireType(pmeta.tire_prefix, representative variant)` (prefix P/LT/ST wins; else
  width+aspect → passenger; else constructionType → light-truck; else other — mirrors SP1's
  `classifyTireTypeFromMeta`, storefront-local, display-only).
- `specs = { construction: pmeta.construction ?? repConstruction, plyRating: rep.ply_rating, tireType, weightLb }`.

`getRelatedTireProducts(brand, excludeHandle): Promise<TireDiscoveryProduct[]>` — call SP2's
`getTireDiscoveryProducts({ filters: { ...EMPTY_TIRE_FILTERS, brands: [brand] }, sort: "relevance", page: 1 })`,
drop the current handle, `.slice(0, 4)`. Throw-safe (SP2 already returns empty on Meili failure).

### Hero (client) + size selection

`TireHero` owns `selectedRim: number` + `selectedSizeLabel: string`:
- `rimDiameters` chips (hide when `≤1`); selecting a rim re-snaps the size to the first available size at that rim.
- `sizesForRim = sizeOptions.filter(s => s.rimDiameterIn === selectedRim)`.
- `selectedSize = sizeOptions.find(s => s.sizeLabel === selectedSizeLabel) ?? first-available-in-rim`.
- default = first rim with an in-stock size (else first rim); first in-stock size at it (else first).
- `variantId = selectedSize?.variantId`; `unitPriceCents = selectedSize?.priceCents ?? product.priceCents`.
- Renders `TireGallery` (big image, no finish switcher) + right column: brand / name / price / rim chips /
  size list (each a button with availability + the size label; low-stock dot) / a small selected-size spec readout
  (section width, aspect, rim, load index, speed) / `TirePurchasePanel`.

`TirePurchasePanel`: qty stepper (default `DEFAULT_TIRE_QTY`, clamp 1–99), **Add to cart** + **Buy Now** calling the
generic `addToCart({ variantId, quantity, countryCode })` then toast / `router.push(checkout?step=address)` —
mirrors the wheel panel MINUS the fitment chip + wishlist. `canPurchase = !!variantId && availability !==
"out_of_stock"`.

### page.tsx branch

```
const detail = await getProductDetail(handle)   // AnyProductDetail
if (detail.kind === "tire") {
  const related = await getRelatedTireProducts(detail.brand, detail.handle)
  return <TireDetailTemplate product={detail} related={related} />
}
const related = await getRelatedProducts(detail) // existing wheel path
return <ProductDetailTemplate product={detail} related={related} />
```

`generateMetadata` reads `detail.brand/name/description` — both shapes carry these, so it works for both with no
branch (title `${brand} ${name} | Wheel Builds`).

## Testing (Vitest)

- `buildTireSizeOptions` — per-variant mapping (size label, canonical, rim, specs, variantId, price cents,
  availability), sorted by rim→width→aspect, from-price = min non-zero.
- `classifyTireType` — prefix precedence + structural fallback (mirror SP1's fixture cases).
- `buildTireSpecRows` — hides zero/missing rows (weight 0, null construction/ply).
- The size-selection resolver — rim gate filters sizes; selecting a rim re-snaps; a size resolves the right
  `variantId`; default picks a first-available size. (Pure helper extracted from the hero, e.g. `sizesForRim` +
  `pickDefaultTireSize`.)

## Rollout

Storefront-only. No backend/migration. A tire PDP renders real data only after the prod cutover (tire feed apply →
tire products exist in Medusa + Meili). Until then a tire handle 404s (no tire products) — correct. The route/build
caveat is identical to SP2 (full `next build` is env-blocked by pre-existing backend-dependent `generateStaticParams`
in collections/categories — not a tire regression). Gate on vitest + tsc 0-new + route compiles; live tire PDP
browse DEFERRED → pre-deploy (needs tire products).

## Out of scope

- **Tire fitment** ("does this tire fit my car") — parent spec.
- **Wishlist** — the wheel Save button is toast-only; tires match (toast).
- **Real tire photography** — vendor CDN thumbnails pass through; a placeholder glyph when null (as SP2).
- **Refactoring the wheel PDP** — untouched beyond the 3-file discriminant seam.

## References

- Parent: [tire-store design](2026-07-02-tire-store-design.md) ; SP2 done: [tire-discovery design](2026-07-02-tire-discovery-design.md)
- Mirror source: wheel PDP `storefront/src/modules/product-detail/` ; SP2 reuse `storefront/src/modules/tire-discovery/`
