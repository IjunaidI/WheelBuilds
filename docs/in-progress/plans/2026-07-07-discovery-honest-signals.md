# Discovery honest signals (WB-074) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Every count, tag, and "fits your vehicle" claim on discovery + home is derived from real data and honest under degradation — no first-element facet collapse, no silent 200-cap, no cached over-claim, no all-black cards, no `"BLANK"` bolt pattern, no "0 brands" / fabricated "08".

**Architecture:** Storefront read-layer (`get-products.ts` fit branch, `get-product.ts`/`get-featured.ts` card mappers) + a few home/discovery components. Pure tally/filter logic unit-tested; wiring rides tsc + review.

**Tech Stack:** Next.js 15 / React 19 storefront (vitest). Meilisearch read via `get-products.ts`; PDP-adjacent card data via the Store API.

**Spec:** [docs/in-progress/specs/2026-07-07-discovery-honest-signals-design.md](../specs/2026-07-07-discovery-honest-signals-design.md)

## Global Constraints
- All commands from `storefront/`. `npx -y pnpm@9.10.0` if pnpm missing.
- Gate: `npx vitest run` green + `npx tsc --noEmit` no NEW errors beyond the ~14 baseline. `build:next` needs a live backend — do NOT run.
- No Meili index/transformer change; do NOT touch the non-fit discovery path (already correct) or the PDP hero fit logic (WB-072).
- Mirror the tire twin `facetsFromTireHits` (`tire-discovery/data/get-tire-products.ts`) for D1/D3 — it's the reference implementation.
- Commit `fix(discovery): <what> (WB-074 D<n>)` + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Fit-mode facet counts from hit arrays, disjunctive (D1 + D3, HIGH/MED)

**Files:** Modify `storefront/src/modules/discovery/data/get-products.ts` (`facetsFromProducts` → hit-array tally; fit branch facet call). Test: the discovery data test (extend / new `get-products.facets.test.ts`).

- [ ] **Step 1 — read** the fit branch (`get-products.ts:164-214`): `hitToProduct`, `facetsFromProducts`, where the raw Meili hits (`h.diameters`, `h.bolt_patterns`, widths, offsets) live, and **where the sidebar filters (diameter/brand/finish/width/offset) are applied** in fit mode (Meili filter vs post-fetch). Read the tire twin `facetsFromTireHits` (`get-tire-products.ts:117-131`) as the reference.
- [ ] **Step 2 — failing test:** a fit-mode product with `diameters:[18,20]`, `bolt_patterns:["5x114.3","5x120"]` contributes to BOTH values of each dimension (D1); and each dimension's counts are computed with the OTHER active sidebar filters applied but NOT its own (D3 — selecting `diameter=18` still shows the `20` count).
- [ ] **Step 3 — implement:** replace `facetsFromProducts(products)` with `facetsFromHits(hits, activeSidebarFilters)` that (a) tallies every element of each hit's dimension arrays (D1), and (b) for each dimension, counts over the fit-candidate hits filtered by all OTHER sidebar filters, skipping its own (D3) — the in-memory analogue of the non-fit branch's per-dimension `buildFilters(..., skip)`. If Step 1 shows the sidebar filters are applied in the Meili query (so the candidate set is already narrowed), reconstruct the pre-own-filter set per dimension in-memory over the ≤200 candidates. **Fallback (spec §7):** if true disjunctive is unclear from the plumbing, ship D1 (correct all-values tally) + leave a `// TODO(D3)` and a header note "counts within your vehicle's fitment" — never ship wrong counts.
- [ ] **Step 4:** run test + `npx vitest run` + `npx tsc --noEmit`. Commit `fix(discovery): fit-mode facet counts from hit arrays, disjunctive (WB-074 D1/D3)`.

### Task 2: Honest 200-cap signal (D2, MED)

**Files:** Modify `get-products.ts` (fit branch — capture `estimatedTotalHits`, set `isCapped`), the `DiscoveryResult` type, `storefront/src/modules/discovery/components/discovery-header/*` + `templates/index.tsx` (display + pagination bound).

- [ ] **Step 1 — read** the fit Meili search response shape (does it return `estimatedTotalHits`?), `DiscoveryResult`'s type, `DiscoveryHeader`'s "N RESULTS" copy, and the pagination `Math.ceil(totalCount/pageSize)`.
- [ ] **Step 2 — failing test:** `isCapped` is true iff `estimatedTotalHits > FIT_CANDIDATE_CAP`; when capped, `totalCount` is NOT presented as a precise smaller number.
- [ ] **Step 3 — implement:** add `isCapped: boolean` (and keep the real `estimatedTotalHits` if useful) to `DiscoveryResult`; set it in the fit branch. Header renders **"Top 200 matches — refine to narrow"** (or similar) instead of "N RESULTS" when capped; pagination is bounded to the loaded candidates (no phantom pages). Non-fit mode is unchanged.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(discovery): honest 200-cap signal in fit mode (WB-074 D2)`.

### Task 3: No cached over-claim on Store-API failure (D4, MED)

**Files:** Modify `get-products.ts` (fit branch `fetchDiscoveryProducts` Store-API catch). Test: extend the cache-contract test (mirror WB-021's).

- [ ] **Step 1 — read** the Store-API catch (`get-products.ts:187-205`) + the `unstable_cache` wrapper (`:270-291`) + WB-021's existing cache-contract test (the one asserting Meili failures throw past the cache).
- [ ] **Step 2 — failing test:** a Store-API `sdk.store.product.list` failure in the fit branch **throws** (so `unstable_cache` never stores it) and the outer path degrades to an empty, uncached result — not a cached over-claim.
- [ ] **Step 3 — implement:** in the fit-branch catch, **rethrow** (don't swallow into `variantsById={}`/`fetched=false`) so the failure propagates to the same outer uncached-empty degradation WB-021 established for Meili failures. Update the file's doc comment to cover this failure mode.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(discovery): don't cache over-claiming fit results on Store-API failure (WB-074 D4)`.

### Task 4: Card finish from variant union + no BLANK bolt pattern (D6 + D7, MED/LOW)

**Files:** Modify `storefront/src/modules/product-detail/data/get-product.ts` (`getRelatedProducts`), `storefront/src/modules/home/data/get-featured.ts` (`toFeatured`), `storefront/src/modules/home/components/featured-blocks/index.tsx` (bolt consumer). Test: the card-mapper tests.

- [ ] **Step 1 — read** `getRelatedProducts` (`get-product.ts:187-190`) + `mapToDetail`'s variant-finish union (`:67`, `finishOptionsList.map(f => f.normalized)`) + `toFeatured` (`get-featured.ts:33,41`) + whether these paths already fetch variant metadata (widen `fields` only if not) + `featured-blocks/index.tsx:72`. Note `isRealBoltPattern` is already imported in `get-product.ts`.
- [ ] **Step 2 — failing test:** the related/featured mapper returns the **variant-metadata finish union** (not `normalizeFinish(product.metadata.finish)`), omits the swatch when there's no finish data (never defaults to black), and drops a `"BLANK"`/placeholder bolt pattern (D7) at all three sites.
- [ ] **Step 3 — implement:** (D6) derive `finishes` from the variant-metadata union like `mapToDetail` (extract a shared helper if clean), widening the products query `fields` to include variant metadata if the path doesn't already; empty → omit, not black. (D7) wrap the bolt pattern in `isRealBoltPattern(...)` in `getRelatedProducts`, import+apply it in `toFeatured`, and guard the `featured-blocks/index.tsx:72` consumer so `"BLANK"` renders as absent.
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(discovery): real finish union + drop BLANK bolt pattern on cards (WB-074 D6/D7)`.

### Task 5: Home metadata + New-Drops counter honesty (D5 + D8, MED/LOW)

**Files:** Modify `storefront/src/app/[countryCode]/(main)/page.tsx` (`generateMetadata`), `storefront/src/modules/home/components/new-drops-row/index.tsx` (counter).

- [ ] **Step 1 — read** `generateMetadata` (`page.tsx:14-21`) + the Hero/TrustStrip guards it should mirror + `new-drops-row` (`:9,14`, the `counter="08"` literal + `drops.length`).
- [ ] **Step 2 — implement:** (D5) when `brandCount` is falsy, the SEO description drops the numeral ("Authorized dealer for premium aftermarket wheel brands"), mirroring the Hero/TrustStrip guard. (D8) set `new-drops-row`'s `counter` to the real `drops.length` (zero-padded to 2 digits) or remove the numeric prop — no hardcoded "08". (Optional unit test for the D5 description helper if extracted.)
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(discovery): honest home metadata + New-Drops counter (WB-074 D5/D8)`.

### Task 6: Gate sweep
- [ ] `cd storefront && npx vitest run && npx tsc --noEmit` (baseline-only, no new errors).
- [ ] `git grep -n "metadata.finish" storefront/src/modules/product-detail/data storefront/src/modules/home/data` → related/featured no longer read product-level finish (D6). Commit any fallout.

## Self-Review
Spec coverage: D1/D3→T1, D2→T2, D4→T3, D6/D7→T4, D5/D8→T5; gates→T6. All 8 mapped. Grouped by file surface (fit branch T1–T3; card mappers T4; home copy T5) to minimize cross-task churn. D3 has an explicit spec-sanctioned fallback in T1 (never ship wrong counts). D4's behavior change (empty vs cached over-claim) is the documented decision. Types: `isCapped` on `DiscoveryResult` (T2) consumed by the header/template. No placeholders — each read-step pins file:line + the tire-twin reference before editing. Ordering: independent tasks; T1–T3 share `get-products.ts` so run in sequence.
