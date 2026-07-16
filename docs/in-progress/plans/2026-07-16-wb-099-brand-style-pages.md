# WB-099 Brand & style landing pages — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. **Storefront only.** Spec: [../specs/2026-07-16-wb-099-brand-style-pages-design.md](../specs/2026-07-16-wb-099-brand-style-pages-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (no globals — `import { describe, it, expect } from "vitest"`); tsc **2-error baseline**; `npx next build` (gates `"use server"` async-export + the new routes); `npx next lint`. `next build` needs the backend on :9000. Branch `feat/g12-wave-a-discovery-merch` (WB-098 lands first). **Thin reuse of the discovery engine — do NOT fork `DiscoveryTemplate`.** Slug = the Medusa brand-collection handle (WB-086's `getCollectionByHandle`); brand `collection.title` = the exact Meili `brand` facet value (byte-identical, don't normalize). Canonicals via the WB-095 `lib/util/canonical.ts` helper; sitemap via `app/sitemap.ts`.

---

### Task 1: shared discovery-hook fixes (base-path clear-all + hideBrand)
**Files:** `modules/discovery/data/use-discovery-query.ts` (~185-187 `clearAll` hardcodes `/store`); `modules/discovery/components/filter-rail/filter-sections.tsx` (~254-266 Brand section) + the rail's `index.tsx`/`mobile-trigger` that pass props; `modules/discovery/templates/index.tsx` (thread a `hideBrand` prop through to the rail). Test: the clear-all target.
- [ ] Failing test: a pure `clearAllTarget(pathname)` → returns the current base path (`/us/brands/fuel` → `/us/brands/fuel`, `/us/store` → `/us/store`) so clear-all preserves a pinned brand page. (If clear-all's logic is inline, extract the pure decision.)
- [ ] RED → implement: `clearAll` pushes to the current pathname (via `usePathname()`), not a hardcoded `/store`. Add a `hideBrand?: boolean` prop to `FilterSections` (default false → `/store` unchanged) that omits the Brand accordion section. Thread it through `DiscoveryTemplate` → the rail (both desktop + mobile-drawer instances).
- [ ] GREEN vitest; `tsc`; `next build` (store still works). Commit `feat(WB-099): base-path clear-all + hideBrand prop on the discovery rail`.

---

### Task 2: brand-collection listing + tile join
**Files:** `lib/data/collections.ts` (new `listBrandCollections()`); new `modules/brands/data/brand-tiles.ts` (pure join) + test.
- [ ] Failing test: pure `buildBrandTiles(countMap, collections)` → `{ name, count, href }[]` joining the Meili brand→count map (`facets.brands`) with `{title,handle}[]`; a brand with a count but NO matching collection handle is dropped (or linked to `/store?brands=` — pick the safe default: **drop it**, and log; a tile must resolve); sorted by count desc.
- [ ] RED → implement: `listBrandCollections()` = an unfiltered `sdk.store.collection.list({ limit: … })` → `{title, handle}[]` (mirror `getCollectionByHandle`'s SDK shape). `buildBrandTiles` joins on the exact `title` (=== the facet key). Handle pagination if the collection count exceeds one page.
- [ ] GREEN vitest; `tsc`. Commit `feat(WB-099): listBrandCollections + brand-tile join helper`.

---

### Task 3: /brands index + /brands/[slug]
**Files:** new `app/[countryCode]/(main)/brands/page.tsx` (index) + `brands/[slug]/page.tsx`; new `modules/brands/` components (hero, tile grid); reuse `getHomeCatalog`, `getDiscoveryProducts`, `parseQueryFromSearchParams`, `DiscoveryTemplate`, `canonicalUrl`.
- [ ] Failing test: none practical for the routes (page composition) — a thin unit if a slug/title helper emerges; otherwise the build + live smoke is the gate.
- [ ] Implement: `/brands` index — `getHomeCatalog().facets.brands` + `listBrandCollections()` → `buildBrandTiles` → hero + tile grid; `generateMetadata` (static title) + `alternates: canonicalUrl("/brands")`. `/brands/[slug]` — `await params`; `getCollectionByHandle(slug)` → unknown → `notFound()`; pin `filters.brands=[collection.title]` merged with `parseQueryFromSearchParams(sp)` for the other facets/sort/page; `getDiscoveryProducts` → a brand hero (name + result count) above `<DiscoveryTemplate hideBrand result={…} />`; `generateMetadata` (brand name in title/desc) + `canonicalUrl(\`/brands/${slug}\`)`. Both are Next-15 async `params`/`searchParams`.
- [ ] `next build` exit 0; `tsc`. Live: `/brands` lists brands w/ counts; a tile → `/brands/<handle>` shows the brand grid = `/store?brands=<title>`, Brand facet absent, other facets work, clear-all stays on the brand; `/brands/bogus` 404s. Commit `feat(WB-099): /brands index + /brands/[slug] on the discovery engine`.

---

### Task 4: /styles index + /styles/[slug]
**Files:** new `app/[countryCode]/(main)/styles/page.tsx` + `styles/[slug]/page.tsx`; new `modules/home/components/shop-by-style/style-slug.ts` (pure resolver) + test; reuse `STYLE_DEFS`, `styleTiles`, `DiscoveryTemplate`.
- [ ] Failing test: pure `styleFromSlug(slug)` → the matching `STYLE_DEFS` entry (kebab-case of `label` === slug), unknown → null; and `styleSlug(label)` round-trips (`"TRUCK & DUALLY"` → `"truck-dually"` or the chosen scheme → back). Pin the exact kebab rule.
- [ ] RED → implement: `/styles` index — `styleTiles(getHomeCatalog().facets)` → tiles linking `/styles/<slug>`; hero + `canonicalUrl("/styles")`. `/styles/[slug]` — `styleFromSlug(slug)` → unknown `notFound()`; pin the def's `{[param]: values}` filter merged with the URL params → `getDiscoveryProducts` → hero + full `<DiscoveryTemplate />` (a style is a preset, NOT a lock — keep the full rail); `generateMetadata` + canonical.
- [ ] GREEN vitest; `next build`; `tsc`. Live: nav Style → `/styles` → a style page pins the preset + is further filterable; unknown slug 404s. Commit `feat(WB-099): /styles index + /styles/[slug] from STYLE_DEFS`.

---

### Task 5: repoint the interim surfaces + sitemap
**Files:** `modules/layout/components/nav-items.ts` (~5-8 Brands/Style → `/store`); `modules/layout/templates/footer/index.tsx` + `footer/footer-links.ts` (~17); `modules/home/components/shop-by-brand/index.tsx` (~19,27); `modules/home/components/shop-by-style/` (tiles); `modules/product-detail/components/breadcrumb/index.tsx` (~16 wheel brand crumb); `app/sitemap.ts`.
- [ ] Failing test: none (link repoints). Grep is the gate.
- [ ] Implement: nav Brands→`/brands`, Style→`/styles`; footer "All Brands"→`/brands`, `footerBrandLinks`→`/brands/<handle>` (needs the handle — reuse `listBrandCollections` or the tile join; if the footer only has titles, resolve the handle there); home ShopByBrand tiles→`/brands/<handle>` + "View all brands"→`/brands`; home ShopByStyle tiles→`/styles/<slug>`; the wheel PDP breadcrumb brand crumb→`/brands/<handle>`. **Leave the tire surfaces (`/tires?brands=`) as-is** (out of scope). Sitemap: add `/brands`, one entry per brand handle, `/styles`, one per style slug (us-pinned).
- [ ] Grep: no landing surface still writes `/store?brands=` except the tire breadcrumbs. `next build`; `tsc`; `next lint`. Live: every repointed link lands on the new page; sitemap lists the brand + style URLs. Commit `feat(WB-099): repoint nav/footer/home/breadcrumb to /brands + /styles, sitemap entries`.

---

### Task 6: chunk review
- [ ] `scripts/review-package <base> HEAD` → an **opus** reviewer (new indexable SEO routes + a shared-hook change that touches `/store`). Focus: (a) the `clearAll` base-path fix didn't break `/store`'s own clear-all; (b) `hideBrand` only hides on brand pages, store rail unchanged; (c) the slug→title resolution is the exact WB-086 mechanism (no re-normalization that would break the Meili filter); a brand title with a space/`&` still resolves; (d) `notFound()` propagates through `generateMetadata` + page on a bogus brand/style slug; (e) canonicals are `us`-pinned + absolute (WB-095 rule — no relative-canonical 404 regression); (f) the repoint is complete (grep) and the tire surfaces were correctly left alone; (g) `next build` generates the new routes, tsc at/below baseline.
