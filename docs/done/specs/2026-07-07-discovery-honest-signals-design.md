# Discovery honest signals — counts, cards, and copy that tell the truth (G9 cluster 5) — Design

> Status: **in-progress** (spec). Session = epic **G9** (audit remediation), cluster **discovery-honest-signals**.
> Proposed backlog id: **WB-074** (under the WB-069 umbrella).
> Remediates **8 findings** (storefront log discovery/home "honest-signal" set), re-verified against current
> `main` 2026-07-07 — **all HOLD** (WB-060/071/072 + the tire arc touched adjacent code, never these paths;
> the tire twin already fixed its version of D1).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-storefront.md](../../future/plans/2026-07-06-audit-findings-storefront.md)

## 1. Context

Discovery (the faceted wheel-listing surface) and the home merchandising blocks present **numbers and
tags to the shopper** — result counts, facet counts, "fits your vehicle" listings, finish swatches, bolt
patterns, section counters. The audit found several of these **assert more than the data supports**: in
*fit mode* the facet counts collapse each multi-valued product to its first diameter/bolt-pattern, the
result count silently truncates at a 200-candidate cap, and a Store-API failure caches an *over-claiming*
"these fit" list; related/featured cards read a **retired** product-level `metadata.finish` (so every card
renders black since WB-059) and leak the WB-048 `"BLANK"` placeholder as a bolt pattern; home SEO metadata
says *"Authorized dealer for 0 brands"* when Meilisearch is down; and a home row shows a hardcoded `"08"`
counter unrelated to the real item count.

The remediation principle (G9 theme): **every count, tag, and "fits" claim on the discovery/home surface
is derived from real data and is honest under degradation — a wrong number is worse than no number.**

### The findings this cluster closes

| # | Sev | One-line | Where |
|---|---|---|---|
| D1 | HIGH | fit-mode facet counts tally only each product's FIRST diameter/bolt-pattern (tire twin already fixed) | `discovery/data/get-products.ts` |
| D2 | MED | fit-mode silently truncates at 200 candidates; `totalCount`/pagination lie | `discovery/data/get-products.ts` + header/template |
| D3 | MED | fit-mode facet counts are non-disjunctive — selecting a value hides its siblings | `discovery/data/get-products.ts` |
| D4 | MED | fit-mode caches an over-claiming "these fit" result for 60s when the Store-API variant fetch fails | `discovery/data/get-products.ts` |
| D5 | MED | home SEO metadata emits "…for 0 premium aftermarket wheel brands" when Meili is down | `app/[countryCode]/(main)/page.tsx` |
| D6 | MED | related + featured cards read retired `product.metadata.finish` → every card shows black since WB-059 | `product-detail/data/get-product.ts` + `home/data/get-featured.ts` |
| D7 | LOW | WB-048 `"BLANK"` placeholder leaks as a bolt pattern onto related/featured/featured-block cards (3 sites) | `get-product.ts` + `get-featured.ts` + `featured-blocks/index.tsx` |
| D8 | LOW | home "New Drops" row shows a hardcoded `"08"` counter unrelated to the real drop count | `home/components/new-drops-row/index.tsx` |

### Current-state facts (grounded, re-verified 2026-07-07)

| Fact | Evidence |
|---|---|
| Fit-mode `hitToProduct` sets `diameter: h.diameters?.[0]`, `boltPattern: h.bolt_patterns?.[0]`; `facetsFromProducts` tallies those single scalars. Non-fit path uses Meili `facetDistribution` (all values). The tire twin `facetsFromTireHits` already tallies from the hit ARRAYS. | [get-products.ts:117,119,131-142](../../../storefront/src/modules/discovery/data/get-products.ts#L117), [get-tire-products.ts:117-131](../../../storefront/src/modules/tire-discovery/data/get-tire-products.ts#L117) |
| Fit branch: `limit: FIT_CANDIDATE_CAP` (200), `offset: 0`, no `estimatedTotalHits` check; `totalCount: fitting.length`. Feeds `DiscoveryHeader` "N RESULTS" + `Math.ceil(totalCount/pageSize)` pagination. A true 500-match query reports/pagenates as ≤200. | [get-products.ts:170,178,210](../../../storefront/src/modules/discovery/data/get-products.ts#L170), [discovery/templates/index.tsx:35,41,45](../../../storefront/src/modules/discovery/templates/index.tsx#L35) |
| `facets: facetsFromProducts(fitting)` computed once from the fully-filtered set — no per-dimension skip (the non-fit branch skips own-dimension per facet via `buildFilters(..., skip)`). | [get-products.ts:212,216-260](../../../storefront/src/modules/discovery/data/get-products.ts#L212) |
| Store-API `sdk.store.product.list` failure is caught INSIDE `fetchDiscoveryProducts` (`variantsById={}`, `fetched=false`); `!fetched \|\| productHasFittingVariant(...)` then passes EVERY bolt-pattern candidate unverified; the fn returns normally so the `unstable_cache` wrapper caches the over-claiming result 60s. The file's own doc comment says failures "never cached" — this failure mode isn't covered. | [get-products.ts:187-205,270-291](../../../storefront/src/modules/discovery/data/get-products.ts#L187), [product-has-fitting-variant.ts:38-54](../../../storefront/src/lib/fitment/product-has-fitting-variant.ts#L38) |
| Home `generateMetadata` interpolates `brandCount` unconditionally (`:19`); `Hero` (`:36`) + `TrustStrip` (`:6`) both guard a falsy `brandCount`, metadata doesn't. `getHomeCatalog` swallows Meili failure → `facets.brands={}` → count 0. | [page.tsx:14-21](../../../storefront/src/app/[countryCode]/(main)/page.tsx#L14) |
| `getRelatedProducts` (`:187`) + `toFeatured` (`:41`) map `finishes: [normalizeFinish(pmeta.finish)]`; `buildProductMetadata` no longer emits product-level `finish` ("moved to VARIANT metadata"); `normalizeFinish(undefined)` → `"black"`. mapToDetail derives the real union from variant metadata (`finishOptionsList.map(f => f.normalized)`). | [get-product.ts:67,187](../../../storefront/src/modules/product-detail/data/get-product.ts#L67), [get-featured.ts:41](../../../storefront/src/modules/home/data/get-featured.ts#L41), [build-metadata.ts:14-30](../../../backend/src/modules/vendor-sync/pipeline/build-metadata.ts#L14) |
| `boltPattern: String(m.bolt_pattern_raw ?? "")` at `get-product.ts:190` + `get-featured.ts:33`, no `isRealBoltPattern` filter (imported+used correctly at `get-product.ts:47`). Consumer `featured-blocks/index.tsx:72` renders `product.boltPattern && <Stat l="BOLT" v={...}/>` — literal `"BLANK"` is truthy → prints `BOLT: BLANK`. Card `product-card.tsx:81` renders `{diameter}" · {boltPattern}`. | [get-product.ts:190](../../../storefront/src/modules/product-detail/data/get-product.ts#L190), [get-featured.ts:33](../../../storefront/src/modules/home/data/get-featured.ts#L33), [featured-blocks/index.tsx:72](../../../storefront/src/modules/home/components/featured-blocks/index.tsx#L72) |
| `new-drops-row` renders `<SectionHeader counter="08" .../>` — a hardcoded literal disconnected from `drops.length` (0–6 real items); section returns null when empty (so it doesn't lie in the empty case, only 1–6). `shop-by-style` counts ARE real (live `FacetCounts` sums, zero-count tiles filtered) — not a finding. | [new-drops-row/index.tsx:9,14](../../../storefront/src/modules/home/components/new-drops-row/index.tsx#L9), [shop-by-style/style-map.ts:20-53](../../../storefront/src/modules/home/components/shop-by-style/style-map.ts#L20) |

## 2. Goals / non-goals

**Goals**
- Fit-mode facet counts reflect ALL of a product's diameters/bolt-patterns (D1) and are disjunctive
  (selecting a value shows sibling counts) (D3); the result count is honest about the 200-cap (D2); a
  Store-API failure degrades to an honest (uncached) result rather than a cached over-claim (D4).
- Cards show the real finish union (D6) and never render the `"BLANK"` placeholder as a bolt pattern (D7).
- SEO metadata degrades to generic copy when the brand count is unknown (D5); the "New Drops" counter
  reflects the real count (D8).

**Non-goals**
- No change to the Meili index schema/transformer or the non-fit discovery path (already disjunctive/correct).
- No redesign of the home page or discovery layout — copy/count/tag honesty only.
- The PDP hero's own fit logic (WB-072, already merged) — untouched.
- The other two G9 clusters — separate specs.

## 3. Chosen approach

Three groups: **(A) fit-mode signal honesty** (D1–D4, all in the `get-products.ts` fit branch), **(B) card
metadata honesty** (D6, D7 — the two card mappers + one consumer), **(C) fabricated copy** (D5 metadata,
D8 counter). Pure tally/filter logic is unit-tested (`vitest`); wiring rides `tsc` + review. `build:next`
needs a live backend and is NOT run.

**Decisions (made now for batch approval — flag any you'd change):**
- **D1 (facet source):** mirror the tire twin — tally fit-mode facets from the raw hit ARRAYS
  (`h.diameters`, `h.bolt_patterns`, widths, offsets), not the `[0]`-collapsed product scalar.
- **D2 (honest cap):** when Meili's `estimatedTotalHits > FIT_CANDIDATE_CAP`, set an `isCapped` flag on
  `DiscoveryResult`; the header shows **"Top 200 matches — refine to narrow"** (not a precise wrong number)
  and pagination is bounded to the loaded set. A modest, honest signal — not a full deep-paginate rework.
- **D3 (disjunctive):** compute each fit-mode facet dimension's counts from the fit-candidate set with all
  OTHER active sidebar filters applied, skipping the own dimension — the same disjunctive shape as non-fit
  mode, done **in-memory** over the ≤200 candidates (cheap; no extra Meili round-trips). The plan's read-step
  establishes exactly where sidebar filters currently apply in the fit branch before wiring this.
- **D4 (no cached over-claim):** on a Store-API variant-fetch failure in the fit branch, **rethrow** so the
  failure propagates past the `unstable_cache` wrapper and degrades to an honest **empty, uncached** result —
  matching WB-021's stated contract. *(This is the one user-visible behavior change: a transient Store-API
  blip yields "no results, try again" instead of a cached over-claiming list. Recommended for the honesty
  theme; flag if you'd rather keep the coarse list with a warning.)*
- **D5 (metadata guard):** when `brandCount` is falsy, the SEO description drops the count ("premium
  aftermarket wheel brands" without a numeral) — same guard shape the Hero/TrustStrip already use.
- **D6 (real finish):** related + featured cards derive `finishes` from the **variant-metadata union**
  (like `mapToDetail`), widening the products query `fields` to include variant metadata where needed (small
  N: ~6–8 cards). If a card genuinely has no finish data, omit the swatch rather than defaulting to black.
- **D7 (no BLANK):** wrap the bolt pattern in `isRealBoltPattern(...)` at all **three** sites (related,
  featured mapper, featured-blocks consumer) so a placeholder renders as absent, not `"BLANK"`.
- **D8 (real counter):** wire `new-drops-row`'s `counter` to the real `drops.length` (zero-padded) or drop
  the numeric prop — no hardcoded `"08"`.

## 4. Interfaces & isolation

Pure / unit-tested:
- `facetsFromHits(hits, activeFilters)` — the D1+D3 disjunctive tally over raw hit arrays (new/renamed
  from `facetsFromProducts`).
- The D2 cap decision (`isCapped = estimatedTotalHits > cap`) and the D5 description-copy helper.
- `isRealBoltPattern` (exists) applied at the D7 sites; the D6 variant-finish-union mapper (reuse
  `mapToDetail`'s logic — extract if shared).

I/O / wiring (tsc + review): the fit-branch rethrow (D4), the `fields` widening (D6), the header/template
`isCapped` display (D2), the `new-drops-row` counter (D8).

## 5. Testing

- **Storefront `vitest`:** `facetsFromHits` counts every value of a multi-valued hit (D1) and is disjunctive
  (D3); `isCapped` true iff `estimatedTotalHits > cap` (D2); the metadata-description helper drops the count
  when brandCount is 0 (D5); the finish mapper returns the variant union and omits (not black) when empty
  (D6); the bolt-pattern mapper drops `"BLANK"` (D7). Extend the existing `get-products`/discovery tests.
- **D4** (rethrow → uncached empty): a unit test that a Store-API failure in the fit branch throws (so the
  cache never stores it), mirroring WB-021's existing cache-contract test.
- Wiring (header cap display, fields widening, counter): `tsc` + review.

## 6. Deploy notes

- **No migration, no new env, no index change.** All fixes are storefront read-layer + component copy.
- **D4 changes degradation behavior** (transient Store-API failure → empty vs cached over-claim). No infra
  change; worth a line in the STATUS changelog.

## 7. Risks & trade-offs

- **D3 disjunctive in fit mode** is the most intricate change; the plan gates it behind a read-step that
  pins where sidebar filters apply. If the candidate-set plumbing makes true disjunctive counting unclear,
  the accepted fallback is **correct non-disjunctive** (D1 alone) **plus** a header note that fit-mode facet
  counts are within-fitment — never ship wrong counts to buy disjunctivity.
- **D4 empty-vs-over-claim** is a deliberate honesty trade-off (documented decision above).
- **D6 fields widening** must not balloon the related/featured query cost — small N, but confirm the query
  already fetches variants (it does for the fitment path) before widening.
- D2/D5/D7/D8 are low-risk, self-contained copy/guard fixes.
