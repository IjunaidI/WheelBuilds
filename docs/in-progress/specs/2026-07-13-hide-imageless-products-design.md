# Hide products with no image, everywhere — Design

> Status: **in-progress** (spec).
> Proposed backlog id: **WB-084**.
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)

## 1. Context

A product with no photograph currently still appears on every storefront surface — Discovery, the
home merchandising blocks, related rows, and its own PDP — rendered with a `<Wheel>` line-drawing
**placeholder** in place of the missing image ([product-card.tsx:39-49](../../../storefront/src/modules/discovery/components/grid/product-card.tsx#L39), tire card the same). The
requirement: **if a product has no image from the source catalog, it must not be shown anywhere.**

Vendor-sync already drops image-less feed rows at staging ([stage.ts:76](../../../backend/src/modules/vendor-sync/pipeline/stage.ts#L76), `skippedNoImageCount`)
and sets the product `thumbnail` from the vendor CDN image ([apply.ts:399](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L399)), so image-less products
should already be rare. This spec makes their absence a **guarantee** at the read/display layer,
independent of how a product got into the catalog (feed edge case, admin-created, feed hiccup).

**Definition — "no image":** a product's Medusa `thumbnail` is null, empty, or whitespace-only.
`thumbnail` is the right signal because it is what vendor-sync populates and what every storefront
card already keys off; a shared one-line predicate `hasImage(thumbnail)` =
`typeof thumbnail === "string" && thumbnail.trim().length > 0` is the single source of that rule.

**Decisions (user-confirmed 2026-07-13):**
- **D1 — PDP behavior:** an image-less product's PDP returns **404** (`notFound()`), not a placeholder
  render. Fully consistent with "don't show it anywhere."
- **D2 — Enforcement layer:** enforce **at the source** — the backend Meilisearch transformer skips
  image-less products so they never enter the index (exact facet counts + pagination), plus guards on
  the Store-API-fed surfaces the index does not cover. Requires a one-time Meili re-index.

## 2. Current-state facts (grounded)

| Fact | Evidence |
|---|---|
| Discovery/home/tire cards render `product.thumbnail` and fall back to `<Wheel>` when null — the product is shown, not hidden. | [product-card.tsx:39-49](../../../storefront/src/modules/discovery/components/grid/product-card.tsx#L39), [tire-product-card.tsx:29-31](../../../storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx#L29) |
| `buildSearchDocument` is the single index-time gate for BOTH wheels and tires; returning `null` routes through the medusa-config coalesce stub. **Caveat:** that stub today uses `product?.metadata?.product_type \|\| 'non-wheel'`, so a null-returning *image-less wheel* (whose `metadata.product_type` is `"wheel"`) would re-index as a matching `{id, product_type:"wheel"}` stub — the coalesce must be forced to a constant `'non-wheel'` (§3.2). `IndexableProduct` already carries `thumbnail`. | [build-search-document.ts:34-39](../../../backend/src/modules/vendor-sync/search/build-search-document.ts#L34), [medusa-config.js:292-296](../../../backend/medusa-config.js#L292) |
| Discovery + tire discovery + all Meili-backed home sections read the index; hits carry `thumbnail`. | [get-products.ts](../../../storefront/src/modules/discovery/data/get-products.ts), [get-tire-products.ts:84-97](../../../storefront/src/modules/tire-discovery/data/get-tire-products.ts#L84), [get-home-catalog.ts](../../../storefront/src/modules/home/data/get-home-catalog.ts) |
| `getProductDetail` is the single loader for BOTH wheel and tire PDP; the tire branch is downstream of the shared `if (!product) notFound()`. | [get-product.ts:96-135](../../../storefront/src/modules/product-detail/data/get-product.ts#L96) |
| `getRelatedProducts` (Store API by brand collection) and `getFeaturedProducts`→`toFeatured` (Store API curated handles) build cards without an image check. Related **tires** go through the Meili path, so they are covered by the transformer. | [get-product.ts:188-211](../../../storefront/src/modules/product-detail/data/get-product.ts#L188), [get-featured.ts:64-91](../../../storefront/src/modules/home/data/get-featured.ts#L64) |
| The Meili plugin re-indexes per product on `product.updated`/`product.created` events — a transformer logic change only takes effect for existing docs after a re-index. | [apply.ts:275-286](../../../backend/src/modules/vendor-sync/pipeline/apply.ts#L275) |

## 3. Design

### 3.1 Shared predicate
- **Backend:** `hasImage(thumbnail?: string | null): boolean` in the vendor-sync `search/` dir (next to
  `build-search-document.ts`).
- **Storefront:** the same one-liner as a small util (e.g. `lib/util/has-image.ts`).

Kept as two trivial copies (not a shared fixture like `normalize-finish`) because
`str && str.trim().length > 0` has no drift risk. Both must agree; document the twin relationship in a
one-line comment on each, referencing the other.

### 3.2 Primary gate — backend Meili transformer
In [build-search-document.ts](../../../backend/src/modules/vendor-sync/search/build-search-document.ts), at the top of `buildSearchDocument`, before the
`product_type` dispatch:

```ts
if (!hasImage(product.thumbnail)) return null
```

Returning `null` is the existing "not indexable" path. This removes image-less **wheels and tires** from
the index in one place; because they are simply absent, facet counts, `estimatedTotalHits`, and
pagination stay exact. Covers Discovery, tire discovery, and every Meili-backed home section (New Drops,
Shop by Style/Brand, Catalog Wall, Featured Blocks' Meili fallback) with no per-surface change.

**Required companion edit — harden the coalesce stub.** The plugin transformer coalesces a `null` to a
minimal stub, and that stub currently copies `product.metadata.product_type`. An image-less *wheel* has
`product_type === "wheel"`, so a bare `null` would re-index it as `{id, product_type:"wheel"}` — still
matched by Discovery's `product_type = "wheel"` filter, defeating the gate. Change the fallback in
`medusa-config.js` to force a constant non-matching value:

```js
transformer: (product) =>
  buildSearchDocument(product) ?? { id: product.id, product_type: 'non-wheel' },
```

Nothing consumes the stub's `product_type` beyond the `= "wheel"|"tire"` exclusion, so forcing
`'non-wheel'` is safe for genuine non-wheels too. Meili's `addDocuments` replaces by primary key, so a
re-indexed image-less product's stale wheel fields are fully overwritten by this stub.

### 3.3 Re-index (one-time ops step)
Trigger a full product re-index so the updated transformer re-runs over existing catalog and purges any
already-indexed image-less docs. Mechanism: emit `product.updated` for all products (plugin re-indexes
per event) — the plan pins the exact command (an admin/`medusa exec` script, or the plugin's own
re-sync). Practical purge set is near-zero (staging already filters image-less rows), so this is a
safety pass, not a bulk migration.

### 3.4 Store-API guards (surfaces the index does not feed)
- **PDP 404 (wheels + tires):** in `getProductDetail`, immediately after `if (!product) notFound()`, add
  `if (!hasImage(product.thumbnail)) notFound()` — placed **before** the tire branch so it 404s both PDP
  types. Propagates through `generateMetadata` + the page (same path bogus handles already 404 on).
- **Related products:** `getRelatedProducts` adds `.filter((p) => hasImage(p.thumbnail))` before
  `.map(toRelatedProduct)`.
- **Featured Blocks:** `getFeaturedProducts` filters the curated Store-API products by
  `hasImage(p.thumbnail)` (drop in the `curated` build); the Meili fallback is already gated by §3.2.
- **Related tires** (`getRelatedTireProducts`): no change — it reads through `getTireDiscoveryProducts`
  (Meili), already gated.

### 3.5 Deliberately unchanged
- The card-level `<Wheel>` fallback stays in both cards. Post-change it can only trigger for a *broken
  CDN URL* (thumbnail present but 404s at fetch), which is a different concern out of scope here.
- **Non-destructive:** no product is deleted or unpublished in Medusa. Cart and order line items render
  their own stored thumbnail/title, so existing carts and order history are unaffected. The only visible
  edge: a direct PDP click on an image-less item already sitting in an old cart 404s — rare and
  acceptable.

## 4. Testing

- **Backend unit** (`build-search-document`): returns `null` for an image-less wheel and an image-less
  tire (empty and whitespace thumbnail); builds the normal wheel/tire doc when a thumbnail is present.
- **Backend unit** (`hasImage`): null / `""` / `"  "` → false; a real URL → true.
- **Storefront unit** (`hasImage`): same table.
- **Storefront** (`getProductDetail`): calls `notFound()` when the fetched product has no thumbnail
  (mock `getProductByHandle`); renders normally when it does.

## 5. Rollout order
1. Backend: add `hasImage` + transformer gate. Deploy.
2. Re-index products (§3.3).
3. Storefront: add `hasImage` + the three Store-API guards. Rebuild.

Both code changes are additive and independently safe; the re-index only affects how existing image-less
docs (if any) are represented in the index.

## 6. Out of scope
- Broken-CDN-URL detection (thumbnail set but image 404s at render).
- Requiring a non-empty Medusa `images[]` gallery beyond `thumbnail` (thumbnail is the operative signal;
  for this catalog thumbnail is derived from the same representative image).
- Any admin surface — this is storefront-visibility only.

## 7. Refs
- Backlog item: WB-084 (to be added to [docs/future/BACKLOG.md](../../future/BACKLOG.md)).
- Plan: to be written (`docs/in-progress/plans/2026-07-13-hide-imageless-products.md`).
