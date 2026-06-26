# Home & merchandising — real content (G4) — Design

> Date: 2026-06-26. Status: in-progress. Pillar: Home. Work-group **G4**.
> Replaces the three fabricated/placeholder home surfaces with real, honest content.
> Backlog: **WB-004** (Featured Blocks + Build Gallery), **WB-023** (newsletter persistence),
> **WB-028** (hardcoded merchandising copy).

## Context

The home page (`storefront/src/app/[countryCode]/(main)/page.tsx`) composes 8 sections. Three are
already live on real catalog data via `getHomeCatalog()` (Meilisearch): **New This Week**
(`new-drops-row`), **Shop by Style** (`shop-by-style`), **Trusted Brands** (`shop-by-brand`). Three
are fabricated:

1. **Featured Blocks** (`featured-blocks/index.tsx`) — 3 hardcoded editorial blocks (MERIDIAN GT
   MONOBLOCK, ATLAS AT-9, RONIN R1) with fake stats and `<ImgPlaceholder>`.
2. **Build Gallery** (`build-gallery/index.tsx`) — a fictional UGC mosaic ("#WHEELBUILDS · 14.2K
   POSTS", "Shot by our community.") of placeholder tiles.
3. **Newsletter** (`newsletter/index.tsx`) — the submit handler fakes success with `setTimeout`;
   nothing is persisted.

Plus hardcoded merchandising copy (WB-028): the trust-strip items (`trust-strip/index.tsx`), hero
eyebrow/headline/subcopy/trust-points (`hero/index.tsx`), and the page metadata's fabricated "40+"
brand claim (`page.tsx`).

**Key enabling fact:** imported products carry real vendor-CDN images on `product.thumbnail`
(image-less rows are filtered at staging), and `DiscoveryProductCard` already renders them with a
`<Wheel>` fallback. So the "real content" fixes are *not* blocked on photography — only on wiring
the sections to the catalog (Featured/Gallery) and on a persistence backend (Newsletter).

**Design principle** (same as the WB-056 / G2 / G3 data-honesty work): real values show; anything
genuinely absent is hidden — never a fabricated placeholder. Logic lives in small pure helpers;
React/route files stay thin.

**Templates followed:** the `customer-vehicle` module (`backend/src/modules/customer-vehicle/`) is
the exact pattern for the new `newsletter` module (model + service + `index.ts` + migration +
one-line `medusa-config.js` registration). The storefront calls custom store routes through
`sdk.client.fetch` (publishable key auto-sent), per `lib/data/customer-vehicles.ts`.

---

## Part 1 · Featured Blocks → real curated products (WB-004a)

**Decision (chosen in brainstorming):** curated handles + fallback.

### Data — `storefront/src/modules/home/data/get-featured.ts`
`getFeaturedProducts(limit = 3): Promise<DiscoveryProduct[]>`:
1. Read `NEXT_PUBLIC_FEATURED_HANDLES` (CSV of product handles).
2. **Curated path** (CSV non-empty): fetch those exact products via the **Medusa Store API by
   handle** through the storefront data layer (authoritative price/stock + real `thumbnail` +
   variant metadata for diameter/width/bolt pattern). Preserve curation order; silently skip any
   handle that does not resolve.
3. **Fallback path** (CSV empty, or every curated handle missing): Meili
   `getDiscoveryProducts({ filters: EMPTY_FILTERS, sort: "price-desc", page: 1 })` → top `limit`
   (premium wheels). Reuses the existing adapter — no index change.
4. Returns at most `limit`. Never throws (both sources already swallow failures → `[]`).

The Store-API product → card mapping reuses the existing `getRelatedProducts` mapping in
`product-detail/data/get-product.ts`; extract the shared mapper as
`storeProductToDiscovery(p): DiscoveryProduct` (in `product-detail/data/`, or a small shared util)
so Featured and Related stay in one shape. (If extraction proves noisy, an inline mapper in
`get-featured.ts` is acceptable — the contract is the `DiscoveryProduct` shape.)

### Pure helper — `selectFeatured(products, curatedHandles, limit)` (unit-tested, vitest)
Pure merge/order/dedup/cap, colocated with `get-featured.ts` (e.g. `select-featured.ts`). Its input
`products` is the **union of the curated-by-handle results and the fallback candidates** (the I/O
wrapper fetches both then hands the concatenation in):
- Emit products ordered by `curatedHandles` first (only handles actually present in `products`),
  then **backfill** with the remaining products in their given order.
- **Dedup by product `id`** (a curated handle may also appear in the fallback set).
- Cap to `limit`.
- Empty `curatedHandles` → first `limit` of `products` (i.e. the fallback) unchanged.

`getFeaturedProducts` is then thin: fetch curated-by-handle; if that already yields ≥ `limit`, return
its first `limit`; otherwise fetch the Meili fallback and return
`selectFeatured(curated.concat(fallback), curatedHandles, limit)`. This is the only branch with logic
worth a test.

### View — `featured-blocks/index.tsx`
Becomes an `async` server component (it currently has no client state). Renders one
`EditorialBlock` per featured product:
- Image: real `product.thumbnail` via `next/image` (object-contain, dark tile), `<Wheel finish>`
  fallback when null — **not** `<ImgPlaceholder>`.
- Eyebrow `FEATURED · {brand}`, headline `{name}`, blurb `{description}` (truncated; omit if empty).
- Stats row: real `DIAMETER {diameter}"`, `WIDTH {width}"`, `BOLT {boltPattern}`, `FROM ${price}`.
  (Drop the fabricated "FINISHES: 4" — wheel products are one-per-finish.)
- "Shop This Wheel" → real `/products/{handle}`.
- `flip` alternation preserved for layout rhythm.
- Return `null` (render nothing) when `getFeaturedProducts()` is empty.

---

## Part 2 · Build Gallery → real catalog mosaic (WB-004b)

**Decision:** repurpose to real catalog. Rename the directory `build-gallery` → `catalog-wall`
(one import line in `page.tsx`; no colocated test to update). Keep the editorial 12-col (desktop) /
2-col (mobile) mosaic visual; the `.build-tile` CSS class in `wheel-builds.css` is reused (no CSS
rename needed — it's a layout class, not a content claim).

### View — `catalog-wall/index.tsx` (async server component)
- Source: `getHomeCatalog().newestProducts` (already fetched this request — free via `react.cache`),
  take up to 8.
- Each tile: real `product.thumbnail` via `next/image` (`<Wheel>` fallback), bottom chip shows
  `{brand}` (or `{name}`), the whole tile links to `/products/{handle}`.
- Honest copy: eyebrow → `LATEST ARRIVALS` (no fabricated post count); title → "Straight off the
  truck." (or similar catalog-honest line); action `MicroLink` → "Browse all wheels" → `/store`.
- Return `null` when there are no products.

Keep the existing span pattern (`TILES` `w`/`h` spans) but drive the *content* from real products —
the spans become a fixed visual rhythm applied to the first N products (the spans are decorative
layout, not data).

---

## Part 3 · Newsletter persistence (WB-023)

**Decision:** Medusa table + store route. No external service.

### Backend module — `backend/src/modules/newsletter/`
Mirrors `customer-vehicle`:
- `models/newsletter-subscription.ts`:
  ```ts
  const NewsletterSubscription = model.define("newsletter_subscription", {
    id: model.id().primaryKey(),
    email: model.text(),
    country_code: model.text().nullable(),
    source: model.text().nullable(),
  }).indexes([{ on: ["email"], unique: true }])
  ```
- `index.ts`: `export const NEWSLETTER_MODULE = "newsletterModuleService"` + `Module(...)`.
- `service.ts`: `class NewsletterService extends MedusaService({ NewsletterSubscription })` with
  `async subscribe(email, meta?): Promise<{ created: boolean }>` — normalize the email, look up by
  it, return `{ created: false }` if present, else create and return `{ created: true }`.
  (Uses the single-object create signature — `createNewsletterSubscriptions({ email, ... })`.)
- Pure helpers `src/modules/newsletter/lib/email.ts`: `normalizeEmail(raw)` (trim + lowercase) and
  `isValidEmail(raw)` (simple, conservative RFC-ish check). **Jest-tested** — the testable seam.
- Migration + module snapshot generated via the Medusa CLI (`medusa db:generate newsletter`);
  both committed (the module snapshot is tracked per repo convention).
- Registered unconditionally in `medusa-config.js` modules: `{ resolve: './src/modules/newsletter' }`.

### Store route — `backend/src/api/store/newsletter/route.ts`
- `POST`: parse `{ email, country_code?, source? }` (validator colocated); `isValidEmail` fails →
  `400 { error: "invalid_email" }`. Otherwise `service.subscribe(normalizeEmail(email), meta)` →
  `201 { subscribed: true }` **regardless of created vs already-existing** (don't leak membership).
- Public route (no auth); the publishable-key requirement is satisfied by the SDK header.

### Storefront
- `lib/data/newsletter.ts`: `subscribeNewsletter(email: string)` →
  `sdk.client.fetch<{ subscribed: boolean }>("/store/newsletter", { method: "POST", body: { email } })`.
- `modules/home/actions.ts`: `"use server"` `newsletterSubscribe(email)` → calls the data fn,
  returns `{ ok: true } | { ok: false, error: string }` (catches network/validation failure).
- `newsletter/index.tsx`: replace the `setTimeout` with `await newsletterSubscribe(email)`; success
  → existing success toast + clear input; failure → error toast ("Couldn't subscribe — try again").
  Stays `"use client"`; native `type="email" required` keeps the cheap client-side gate.

---

## Part 4 · De-hardcode merchandising copy (WB-028)

New config module `storefront/src/modules/home/data/merchandising.ts` — typed exported constants,
changeable in one file without touching component internals:
- `TRUST_STRIP_ITEMS: { icon: IconName; h: string; s: string }[]` (moved from `trust-strip`; the
  `brandCount` substitution stays computed in the component).
- `HERO_COPY: { eyebrow, headlineTop, headlineBottom, subcopy, trustPoints: {l,s}[] }` (moved from
  `hero`).
- `trust-strip/index.tsx` and `hero/index.tsx` import from it.
- `page.tsx`: convert the static `metadata` export to `generateMetadata()` that reads the live
  `brandCount` from `getHomeCatalog()` (cached → free) so the description states the real brand
  count instead of a fabricated "40+".

`STYLE_DEFS` (`shop-by-style/style-map.ts`) is already an isolated config array with its own test —
**left as-is** (WB-028's "shop-by-style category map" is already satisfied).

---

## Units (subagent tasks, ≈6)
1. **Backend newsletter module** — model + service + `index.ts` + pure `email.ts` helpers + jest tests.
2. **Backend newsletter route + wiring** — `POST /store/newsletter` + validator + `medusa-config.js`
   registration + generated migration & snapshot.
3. **Storefront newsletter wiring** — `lib/data/newsletter.ts` + `home/actions.ts` + rewire
   `newsletter/index.tsx`.
4. **Featured Blocks** — `get-featured.ts` + pure `select-featured.ts` (+ vitest) + shared
   `storeProductToDiscovery` mapper + `featured-blocks/index.tsx` real render.
5. **Catalog Wall** — rename `build-gallery` → `catalog-wall`, real product mosaic + honest copy,
   update `page.tsx` import.
6. **Merchandising config** — `merchandising.ts` + wire `trust-strip`, `hero`, `generateMetadata`.

Ordering: 1→2 (route depends on module), 4 may depend on 4's mapper extraction; 3/5/6 independent.

## Out of scope (explicit)
- Real lifestyle/UGC photography; an admin "featured products" curation UI (env CSV instead).
- Newsletter double-opt-in, unsubscribe, rate-limiting/abuse protection (note as future follow-up).
- A real "style" taxonomy facet for Shop by Style (still maps onto existing facets).
- Any change to the already-live `new-drops-row` / `shop-by-brand` / `shop-by-style` data paths.

## Verification
- Backend: `cd backend && pnpm test:sync` (new `email.ts` jest tests green) + `node --check
  medusa-config.js` + `npx tsc --noEmit` (no new errors). The migration generates cleanly.
- Storefront: `cd storefront && pnpm test:unit` (`select-featured` tests green; existing 95 pass) +
  `npx tsc --noEmit` (0 new errors vs the 14 pre-existing on `main`).
- **Deferred to pre-deploy (live backend):** `POST /store/newsletter` persists a row and is
  idempotent (second POST of the same email → still 201, no duplicate row); Featured renders the
  curated handles (and falls back to top-priced when the env is unset); Catalog Wall tiles link to
  real PDPs; the home metadata description shows the real brand count.

## File inventory
**New**
- `backend/src/modules/newsletter/{index.ts,service.ts,models/newsletter-subscription.ts,lib/email.ts}`
- `backend/src/modules/newsletter/__tests__/email.test.ts`
- `backend/src/modules/newsletter/migrations/Migration<ts>.ts` (+ module snapshot)
- `backend/src/api/store/newsletter/route.ts` (+ validator)
- `storefront/src/modules/home/data/get-featured.ts` + `select-featured.ts` (+ test)
- `storefront/src/modules/home/data/merchandising.ts`
- `storefront/src/modules/home/actions.ts`
- `storefront/src/lib/data/newsletter.ts`
- `storefront/src/modules/home/components/catalog-wall/index.tsx` (renamed from `build-gallery`)

**Modified**
- `backend/medusa-config.js` (register newsletter module)
- `storefront/src/modules/home/components/featured-blocks/index.tsx` (real products)
- `storefront/src/modules/home/components/newsletter/index.tsx` (real persistence)
- `storefront/src/modules/home/components/trust-strip/index.tsx` + `hero/index.tsx` (import config)
- `storefront/src/app/[countryCode]/(main)/page.tsx` (generateMetadata + catalog-wall import)
- `storefront/src/modules/product-detail/data/get-product.ts` (extract `storeProductToDiscovery`)

**Removed**
- `storefront/src/modules/home/components/build-gallery/` (renamed → catalog-wall)
