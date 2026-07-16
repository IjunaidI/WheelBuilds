# WB-086 Retire the legacy /categories + /collections listings — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront only. Spec: [../specs/2026-07-15-wb-086-retire-legacy-listings-design.md](../specs/2026-07-15-wb-086-retire-legacy-listings-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (no globals — `import { describe, it, expect } from "vitest"`); 5-error tsc baseline (**`lib/data/collections.ts` owns 1 of the 5 — the baseline may legitimately DROP in this chunk; record the new number, never paper over a rise**). `npx next build` is the real gate here: it is the only thing that catches a deleted-but-still-imported module, and the only thing that catches a `"use server"` non-async export. Branch `feat/g11-wave4-cleanup`. **This chunk lands FIRST in the wave — WB-095 assumes the pages it deletes are gone.** Delete boldly but verify each importer list with a fresh grep before removing a file; the re-verification's importer map is evidence, not permission.

---

### Task 1: D1 — `/categories/*` redirects + delete the route
**Files:** `next.config.js` (~52-60 — the `redirects()` block **already exists** from WB-085; append to it, do NOT open a second one), delete `app/[countryCode]/(main)/categories/` (whole subtree) + `modules/categories/`.
- [ ] Failing test: none needed (config data). Instead, assert the shape by reading `next.config.js` back — skip to implement.
- [ ] Implement: append three rules, **specific before catch-all** (order is load-bearing — `:rest*` would otherwise swallow the first two): `/:countryCode/categories/wheels` → `/:countryCode/store`; `/:countryCode/categories/tires` → `/:countryCode/tires`; `/:countryCode/categories/:rest*` → `/:countryCode/store`. All `permanent: true`. **Do NOT interpolate `:rest*` into the destination** — a repeating param can't be substituted into a non-repeating slot; that exact mistake shipped a 500 in WB-085 (`26db55d`). The destination is a constant. Then delete the `categories/` route subtree + `modules/categories/`.
- [ ] `npx next build` exit 0; `tsc` at/below baseline. Commit `feat(WB-086): 301 /categories/* into Discovery, delete the route (D1)`.

---

### Task 2: D1 — `/collections/[handle]` becomes a thin redirect
**Files:** `app/[countryCode]/(main)/collections/[handle]/page.tsx` (~13-19 sync Next-14 params, ~62 `"| Medusa Store"` title, `generateStaticParams` via `getCollectionsList`), delete `modules/collections/`. New: a pure URL builder + its test.
- [ ] Failing test: a pure `collectionRedirectUrl(countryCode, collection)` → `/us/store?brands=BLACKLINE%20FORGED` for a title with a space (encode it — brand titles are raw vendor strings), and → `/us/store` when the collection is null/has no title.
- [ ] RED → implement: replace the page body with `await params` (Next 15) → `getCollectionByHandle(handle)` → `redirect(collectionRedirectUrl(countryCode, collection))`; unknown handle → `/store`. Delete `generateStaticParams` + `generateMetadata` (the title and the static params both die here). Delete `modules/collections/`. **The `?brands=` join is exact by provenance** — `ensureBrandCollection` sets `title: brand` verbatim from the same `rep` object that feeds the product metadata and the Meili `brand` facet — so do not "normalize" the title on the way out; that would break the match.
- [ ] GREEN vitest; `npx next build` exit 0; `tsc`. Commit `feat(WB-086): /collections/:handle 301s into Discovery ?brands= (D1)`.

---

### Task 3: D1 — stop advertising the retired surface
**Files:** `app/sitemap.ts` (~66-94 — the taxonomy block G10-cleanup added in `60997d6`, i.e. exactly the URLs this chunk retires), `lib/data/categories.ts` (delete — all three exports die with Task 1's page + this block), `lib/data/collections.ts` (keep **only** `getCollectionByHandle` — Task 2 calls it).
- [ ] Failing test: none (deletion). Verify by grep + build.
- [ ] Implement: delete the taxonomy block from `sitemap.ts` (statics + Meili product URLs stay). Delete `lib/data/categories.ts` and its `getCategoriesList` import in the sitemap. From `lib/data/collections.ts` delete `getCollectionsList` (its two callers are now gone) plus the pre-existing zero-importer orphans `retrieveCollection` + `getCollectionsWithProducts`.
- [ ] Grep: zero `/categories` or `/collections` in `sitemap.ts`; zero importers of any deleted export. `npx next build` exit 0; `tsc` — **report the new baseline** (deleting `lib/data/collections.ts` code may drop it below 5). Commit `feat(WB-086): drop taxonomy URLs from the sitemap + dead data-layer exports (D1)`.

---

### Task 4: D1 — sweep the orphaned family + docs
**Files:** delete `modules/store/` (all of it), `modules/products/components/product-preview/`, `modules/products/templates/`, `lib/util/sort-products.ts`; edit `lib/data/products.ts` (~112-156 — remove **only** `getProductsListWithSort`); `storefront/CLAUDE.md`.
- [ ] Failing test: none (deletion). **Re-grep every symbol before deleting it** — the importer map below is from re-verification, not gospel.
- [ ] Implement: delete `modules/store/` entirely — `PaginatedProducts`/`RefinementList`/`SortOptions`/`Pagination` had **zero** importers outside the two pages Tasks 1-2 just deleted, and `templates/index.tsx`'s `StoreTemplate` was **already** orphaned before this chunk (`/store/page.tsx` renders `DiscoveryTemplate`). Delete `product-preview/` and `modules/products/templates/` (the legacy full PDP — zero importers; the live one is `modules/product-detail/`; its `product-info` holds the last internal `/collections/[handle]` link and it's inside dead code). Delete `lib/util/sort-products.ts`. From `lib/data/products.ts` remove `getProductsListWithSort` **and nothing else** — `getProductsList`/`getProductsById`/`getProductByHandle` are live on cart/order enrichment and the PDP. **KEEP `modules/products/components/thumbnail/`** — 5 live importers (account order-card, cart item, checkout-summary, cart-dropdown, order item).
- [ ] Docs: `storefront/CLAUDE.md` — the §Discovery `modules/store/` retention note is now false (its stated reason was the pages this chunk deleted — circular, and it expires here); delete it. The §PDP `modules/products/` note narrows to "`Thumbnail` only". Update the §Layout tree.
- [ ] Grep: zero importers of every deleted symbol. `npx next build` exit 0; `npx tsc --noEmit` at/below the Task-3 baseline; `npx next lint`. Commit `refactor(WB-086): delete the orphaned legacy listing family, keep Thumbnail (D1)`.

---

### Task 5: Chunk review
- [ ] `scripts/review-package <base> HEAD` → a **sonnet** reviewer (mechanical deletion chunk; the risk is a missed importer, which `next build` already gates). Focus: (a) did anything still-live get deleted — re-grep `Thumbnail`, `getProductsList`, `getProductsById`, `getProductByHandle`, `getCollectionByHandle` independently; (b) redirect rules — is the catch-all last, and is `:rest*` kept out of every destination (the WB-085 500); (c) does `?brands=` survive a space/`&` in a brand title; (d) is the tsc baseline honestly reported.
