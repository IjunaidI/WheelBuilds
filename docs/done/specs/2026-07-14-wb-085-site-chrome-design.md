# WB-085 · Site chrome integrity — design

> G11 build-order chunk 2 (Wave 1). Findings **N1, N2, N3, N6, N8, N9, N10, N11, X9** (not-found) + retired-route redirects,
> from the [2026-07-13 UX audit §N/§X](../../future/plans/2026-07-13-ux-completeness-audit.md). Expands
> [fix design §WB-085](../../future/specs/2026-07-13-ux-completeness-fixes-design.md). All findings **re-verified against
> current `main`** (post-WB-089) on 2026-07-14 — evidence inline. Storefront-only; no backend, no re-sync (just a rebuild).

## Problem
The persistent chrome is the least-trustworthy surface: 2 nav items 404, 3 navigate to `#`, **10** footer links 404 (audit said 9 — corrected), the search-drawer "Trending" panel shows 3 fabricated products with fake prices that run zero-result searches, and every dead link lands on chrome-less Medusa boilerplate. A shopper who steps off the happy path concludes the store is broken or fake.

## Decisions (defaults taken; flagged where consequential)
- **Brands/Style → `/store` interim repoint, labels kept.** `/collections` + `/categories` 404 today, so pointing at `/store` strictly improves on dead links. Labels stay "Brands"/"Style"; this is an explicit **placeholder until WB-099** (dedicated brand/style landing pages) — flagged so it isn't mistaken for done. **Simplification (recorded post-review):** "Style" points at bare `/store`, not a `styleTiles()` preset — so Brands and Style are momentarily identical interim links. Accepted: there is no single representative preset for a "Style" label, the footer carries the granular style-preset links, and WB-099 differentiates them properly.
- **Footer Brands column = top 5 live brands** by facet count (reuse `ShopByBrand`'s existing sort), each → `/store?brands=<name>`. Drop the 4 fixture labels ("Forgiato Type" etc.).
- **Not-found scope = all 4** boilerplate pages (root, `(main)`, `(main)/cart`, `(checkout)`) — the audit named 2, but the other two are the same boilerplate and would look inconsistent if left.
- **Mobile vehicle row = reuse `GaragePill`** (self-contained, already in desktop nav) — lowest risk, keeps mobile/desktop vehicle UI consistent.

## Design (storefront)

### 1. Shared `NAV_ITEMS` + repoint (N1, N2)
- Extract the copy-pasted array from `nav/index.tsx:12-20` and `mobile-menu/index.tsx:18-26` into one `layout/components/nav-items.ts` (single source). Both import it.
- Repoint: Wheels→`/store`, Tires→`/tires`, Brands→`/store` (interim), Style→`/store?<preset>` from `shop-by-style/style-map.ts` (`styleTiles`), Support→`/contact`. **DELETE "Build Gallery" + "Deals"** (no pages).
- Verify: no `href="#"` remains in `nav`/`mobile-menu`; every nav href resolves 200.

### 2. Footer real links (N1, N8)
- `footer/index.tsx` Shop column → the exact facet URLs `styleTiles()`/`STYLE_DEFS` build (`?diameters=`/`?finishes=`), "All Wheels"→`/store`, "All Tires"→`/tires`.
- Brands column → top-5 live brands from `getHomeCatalog().facets.brands` (sorted desc, reuse the `ShopByBrand` sort), each `/store?brands=<name>`; drop fixture labels.
- Footer becomes an async server component (or takes props) computing the live brand count → replace the hardcoded "40+ premium aftermarket wheel brands" with the real `Object.keys(facets.brands).length`. **Perf note:** `getHomeCatalog` is `react.cache` + `unstable_cache`(60s) keyed on `EMPTY_FILTERS/newest/page1` — the same key Home already populates, so this is a shared cache hit, not a new per-request Meili call.

### 3. Real search-drawer Trending (N3)
- `search/components/search-drawer/trending.tsx`: replace the hardcoded `TRENDING` array with top-3 of `getHomeCatalog().newestProducts` (real handle/price/thumb, tile → real PDP `/products/<handle>`). Render nothing if the fetch is empty. No fabricated content remains (G4 rule); grep confirms no `BLACKLINE|VANGUARD|ATLAS` in search components.

### 4. Nav polish (N9, N10)
- Remove the heart "Saved" link (`nav/index.tsx:59-66` + `mobile-menu` `ACCOUNT_ITEMS` heart) — no wishlist backend.
- Add a vehicle row to the top of the mobile hamburger drawer: `<GaragePill />` (opens the search drawer), so vehicle context is reachable below 512px (where the desktop `hidden xsmall:flex` GaragePill disappears).

### 5. Home section honesty (N6, N11)
- `catalog-wall/index.tsx`: slice `newestProducts` **after** the New-This-Week window — `newestProducts.slice(NEW_DROPS_COUNT)` then take up to `SPANS.length` — so the two rows never repeat products (New-This-Week takes 0-6, Catalog Wall now takes 6+). Degrades gracefully to fewer tiles if the catalog is short.
- `new-drops-row`: rename the heading "New This Week" → **"New Arrivals"** (drops the false recency claim over an uncapped newest-6).

### 6. Not-found rebrand (X9)
- `app/not-found.tsx`, `(main)/not-found.tsx`, `(main)/cart/not-found.tsx`, `(checkout)/not-found.tsx`: WB-styled (Display/Label + `LocalizedClientLink`, inside `.frame`), replacing the `@medusajs/ui`/`InteractiveLink` boilerplate. The `(main)` one renders inside Nav/Footer chrome with a search CTA + `/store` link.

### 7. Retired-route redirects
- `next.config.js` gains a `redirects()`: `/:cc/results/:query*` → `/:cc/store?q=:query`, `/:cc/search` → `/:cc/store` (301). Legacy routes are already deleted (confirmed gone from the route tree) — this is the SEO/deep-link guard so a stray hit lands in the store, not the not-found page.

## Verify
- Crawl every `href` in `nav`/`mobile-menu`/`footer` → all resolve 200 (script or e2e); grep: no `href="#"` in layout modules, no `BLACKLINE|VANGUARD|ATLAS` in search, no `Forgiato Type` fixture labels in footer.
- Mobile menu shows the vehicle row; not-found renders WB chrome; `/us/results/foo` 301→`/us/store?q=foo`.
- Vitest: `NAV_ITEMS` shared (one definition); footer brands derive from facets (top-N sort); catalog-wall slice excludes the new-drops window.

## Out of scope
Real brand/style landing pages (WB-099 — the Brands/Style repoint is interim), a Deals page, wishlist backend.

## Deploy
Storefront rebuild only. No backend, no Meili re-sync.
