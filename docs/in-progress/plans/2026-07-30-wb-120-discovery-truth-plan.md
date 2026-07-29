# WB-120 · Discovery & Availability Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop discovery surfaces claiming things that aren't true — counts that over-state by 30%, filters that look empty, and "trending" products that can't be bought.

**Architecture:** Style tile counts move from summing facet buckets to a real distinct count via one batched Meilisearch `multiSearch`. The filter rails open their primary dimension and show a value count on every collapsed trigger. The search drawer's Trending tiles gain the availability signal the grid cards already have. Price inputs get real bounds from Meilisearch `facetStats`.

**Tech Stack:** Next.js 15 storefront, Meilisearch (`multiSearch`, `facetStats`), Vitest.

## Verified before planning

Both non-obvious fixes were measured against the live index first, so this plan is not
proposing an approach on faith:

| Question | Measured |
|---|---|
| Does a distinct count fix Q-12? | `totalHits` for `(diameters = 18 OR 19 OR 20)` = **1076** — exactly the listing, vs the tile's 1550 ✓ |
| Can Meilisearch supply real price bounds? | `facetStats.price_min = { min: 7800, max: 245000 }` → **$78–$2,450** ✓ |

## Q-13 is NOT REPRODUCED — do not "fix" it

The tester reported *"American Racing Forged = 25 on homepage but 27 in store filter"*.
Measured today across every surface:

| Surface | Count |
|---|---|
| Homepage `ShopByBrand` tile | **25** |
| `/brands` tile | **25** |
| `/store` filter rail | **25** |
| Meilisearch ground truth (`product_type = "wheel"`) | **25** |

All three surfaces read the **same** `facets.brands` from the same `getHomeCatalog()`
react-cache hit, so they are structurally incapable of disagreeing. The catalog did shift
slightly between the tester's run and now (they saw "1449 results", it is 1447 today), which
is the likeliest explanation.

**Action: record it as NOT REPRODUCED in the triage doc and the backlog. Write no code.**
Inventing a fix for a bug that isn't there is how a real one gets introduced.

## Global Constraints

- **Storefront tsc baseline is exactly 2 errors.** Must not rise.
- **Price units:** the index stores INTEGER CENTS (`price_min`/`price_max`); the UI shows dollars. Any new price code divides by 100 for display and multiplies for filtering — the existing `commitPriceRange` already does this; match it.
- **Discovery reads are cached** via `unstable_cache` (tag `discovery`, 60s) with the try/catch OUTSIDE the cache so empties self-heal (WB-021). Any new Meili read must sit inside that same pattern, not beside it.
- **`getDiscoveryProducts` swallows Meili failures into an empty result and never throws.** New queries must degrade the same way — a failed count must not blank the homepage.
- **No `wb-` prefix.**
- **Commit after every task.** Branch: `feat/g13-qa-remediation`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `storefront/src/modules/home/components/shop-by-style/style-map.ts` | **Modify.** `styleTiles` takes real counts instead of summing buckets. | 1 |
| `storefront/src/modules/home/components/shop-by-style/style-map.test.ts` | **Create.** Pins the double-count regression. | 1 |
| `storefront/src/modules/home/components/shop-by-style/style-filter.ts` + `.test.ts` | **Create.** Pure preset → Meili filter clause. | 1 |
| `storefront/src/modules/discovery/data/get-style-counts.ts` | **Create.** Batched distinct counts. | 2 |
| `storefront/src/modules/home/data/get-home-catalog.ts` | **Modify.** Expose `styleCounts`. | 2 |
| `storefront/src/modules/home/components/shop-by-style/index.tsx` | **Modify.** Pass counts through. | 2 |
| `storefront/src/app/[countryCode]/(main)/styles/page.tsx` | **Modify.** Same. | 2 |
| `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx` | **Modify.** Open bolt pattern; count on collapsed triggers. | 3 |
| `storefront/src/modules/tire-discovery/components/filter-rail/filter-sections.tsx` | **Modify.** Same for size. | 3 |
| `storefront/src/modules/search/components/search-drawer/trending-data.ts` + `.test.ts` | **Modify.** Prefer in-stock, carry `inStock`. | 4 |
| `storefront/src/modules/search/components/search-drawer/trending.tsx` | **Modify.** Badge an out-of-stock tile. | 4 |
| `storefront/src/modules/discovery/data/get-price-bounds.ts` | **Create.** `facetStats` → dollar bounds. | 5 |

---

## Task 1: Make the style count honest (pure core)

**Root cause.** `style-map.ts:49`:

```ts
const count = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
```

`diameters`, `finishes` and `brands` are **multi-valued** on the indexed document, so a
wheel offered in both 18" and 20" lands in two buckets and is counted twice. Measured:

| Style | Preset | Summed | Actual distinct |
|---|---|---|---|
| Street | 18+19+20 | 487+187+876 = **1550** | 1076 |
| Truck & Dually | 22+24+26 | 449+203+81 = **733** | 490 |
| Drag | 15+17 | 153+500 = **653** | 593 |
| Luxury / Off-road / UTV | single value | 602 / 115 / 7 | same ✓ |

The three that matched are exactly the three single-value presets, where summing and
distinct-counting coincide. That is conclusive.

**Files:**
- Create: `style-filter.ts`, `style-filter.test.ts`, `style-map.test.ts`
- Modify: `style-map.ts`

**Interfaces:**
- Produces: `styleFilterClause(def: StyleDef): string`, and `styleTiles(facets, counts?)`
  where `counts` is `Record<string, number>` keyed by label. Task 2 supplies `counts`.

- [ ] **Step 1: Write the failing tests** — a `style-filter.test.ts` asserting the clause
  shape for each `StyleParam` (`diameters` numeric-unquoted, `finishes`/`brands` quoted,
  values OR-joined and parenthesised), and a `style-map.test.ts` asserting that a preset
  with overlapping values reports the **supplied distinct count**, not the bucket sum.

- [ ] **Step 2: Run both to verify they fail.**

  `cd storefront && npx vitest run src/modules/home/components/shop-by-style`

- [ ] **Step 3: Write `styleFilterClause`.** Mirror `vehicle-constraint.ts`'s `lit()`
  quoting so the two cannot drift. Numeric dimensions must not be quoted — Meilisearch
  compares `diameters = 18` numerically and `diameters = "18"` as a string, and the index
  stores numbers.

- [ ] **Step 4: Change `styleTiles` to prefer a supplied count.**

```ts
export function styleTiles(
  facets: FacetCounts,
  counts?: Record<string, number>
): StyleTile[] {
  return STYLE_DEFS.map((def) => {
    // WB-120 Q-12: `counts` is the DISTINCT number of products matching the
    // preset. Summing facet buckets (the old behaviour, kept only as a
    // fallback when no counts are supplied) double-counts every product that
    // appears under more than one value of a multi-valued facet -- a wheel
    // offered in 18" and 20" was counted twice, making STREET claim 1550
    // against a listing of 1076.
    const dist = facets[PARAM_TO_FACET[def.param]] ?? {}
    const summed = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
    const count = counts?.[def.label] ?? summed
    ...
  }).filter((t) => t.count > 0)
}
```

The fallback keeps the homepage rendering if the count query fails, rather than dropping
every tile — but it is the *inaccurate* path, so Task 2 must always supply counts.

- [ ] **Step 5: Run the tests.** Expected PASS.

- [ ] **Step 6: Commit.**

---

## Task 2: Fetch the distinct counts

**Files:**
- Create: `storefront/src/modules/discovery/data/get-style-counts.ts`
- Modify: `get-home-catalog.ts`, `shop-by-style/index.tsx`, `styles/page.tsx`

**Interfaces:**
- Consumes: `styleFilterClause` (Task 1).
- Produces: `getStyleCounts(): Promise<Record<string, number>>` keyed by `StyleDef.label`.

- [ ] **Step 1: Write `getStyleCounts`.** One `multiSearch` with one query per `STYLE_DEFS`
  entry: `hitsPerPage: 1, page: 1`, filter = `product_type = "wheel" AND <clause>`, reading
  `totalHits`. Use `hitsPerPage`/`page` (not `limit`/`offset`) so the total is **exhaustive**
  — WB-088 D13 established that `estimatedTotalHits` can drift from what was actually
  filtered, and a drifting count is the exact bug being fixed.

  Wrap in try/catch returning `{}` on failure, matching `getDiscoveryProducts`' contract —
  a Meilisearch outage must degrade to the old summed counts, not blank the homepage.

- [ ] **Step 2: Thread it through `getHomeCatalog`.** Add `styleCounts` to `HomeCatalog`,
  fetched in the same `react.cache`'d call so the homepage still pays one round trip.

- [ ] **Step 3: Pass counts at both call sites** — `shop-by-style/index.tsx` and
  `styles/page.tsx`.

- [ ] **Step 4: Verify against live numbers.** After building, confirm the six tiles read
  1076 / 490 / 593 / 602 / 115 / 7 — i.e. every tile equals its listing.

- [ ] **Step 5: Full gate + commit.**

---

## Task 3: Collapsed filters that read as empty

**Root cause.** Radix unmounts collapsed accordion content, and both rails omit their
primary dimension from `defaultValue`:

| Rail | line 279 `defaultValue` | Collapsed → looked "empty" |
|---|---|---|
| `/store` | `["brand","diameter","finish"]` | **Bolt pattern**, Price |
| `/tires` | `["brand","rim-diameter","tire-type"]` | **Size**, **Speed rating**, **Load rating**, Price |

The data was always complete — the page payload carries all 46 bolt patterns, 500 tyre
sizes, 16 speed ratings and 80 load indexes.

**Files:** both `filter-sections.tsx`.

- [ ] **Step 1: Open the primary dimension by default.** Add `"bolt-pattern"` on `/store`
  and `"size"` on `/tires`. Bolt pattern is the most important wheel filter and the fitment
  join key; size is the equivalent for tyres.

- [ ] **Step 2: Show the available-value count on every trigger.** This is the actual fix —
  it makes a collapsed section legible *without* opening everything, so the remaining
  closed sections can never be mistaken for empty either. Render the count as a muted
  number beside the label, e.g. `Speed rating 16`.

  Do **not** hand-edit `components/ui/accordion.tsx` (shadcn primitives stay canonical) —
  pass the count as part of the `AccordionTrigger`'s children.

- [ ] **Step 3: Verify the tyre size list isn't silently truncated.** `tire_sizes` returns
  exactly **500** distinct values, which is the index's `maxValuesPerFacet: 500` ceiling —
  suspicious. Query the index for the true distinct count; if it exceeds 500, raise the
  ceiling in `medusa-config.js` or surface the truncation. A silently short size list is a
  real miss on a tyre store. **Record the finding either way.**

- [ ] **Step 4: Full gate + commit.**

---

## Task 4: Trending tiles must not push dead stock

**Root cause.** `trending-data.ts` takes `newest.slice(0, 3)` and maps to
`{ handle, brand, name, priceCents, finish }` — **dropping `DiscoveryProduct.inStock`**, so
the tile can neither filter nor badge on it. All three being out of stock, as the tester
saw, is then just luck of the draw.

**Correction carried from the triage:** the `/store` and `/tires` "In stock only" toggles are
**not** broken (measured: 1447 → 1138 wheels, 611 → 399 tyres, zero OOS badges on either).
Only the drawer lacks a gate.

**Files:** `trending-data.ts` + test, `trending.tsx`.

- [ ] **Step 1: Write the failing test** — `toTrendingProducts` must (a) carry `inStock`
  through, (b) prefer in-stock products when choosing three, and (c) still return three
  when fewer than three are in stock.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Implement.** Stable partition — in-stock first, original order preserved
  within each group — then `slice(0, count)`.

  **Deliberately NOT a hard filter:** if fewer than three in-stock products exist, three
  badged tiles beat one tile. This also keeps the change compatible with WB-110
  (special-order products currently blanket-read OUT OF STOCK).

- [ ] **Step 4: Badge the tile.** Reuse the grid card's strict `inStock === false` check, so
  an unknown value never mis-badges.

- [ ] **Step 5: Full gate + commit.**

---

## Task 5: Real price bounds

**Files:** Create `get-price-bounds.ts` (+ test); modify both filter rails' price section.

**Verified:** `facetStats.price_min = { min: 7800, max: 245000 }` (cents) → **$78–$2,450**.

- [ ] **Step 1: Write the failing test** for a pure `priceBoundsFromFacetStats(stats)` →
  `{ minUsd, maxUsd } | null`: floors the min and ceils the max to whole dollars, returns
  `null` on missing/partial stats so callers fall back to today's static placeholders.

- [ ] **Step 2: Implement, and add `price_min`/`price_max` to the facet query** so Meili
  returns `facetStats` at all.

- [ ] **Step 3: Use the bounds as the inputs' placeholders** (`$78` / `$2,450` instead of
  today's hard-coded `$0` / `$2,500`).

- [ ] **Step 4: STOP and reassess before adding the shadcn `Slider`.** It needs
  `npx shadcn@2.1.8 add slider` plus `@radix-ui/react-slider`, and pnpm is not reliably on
  PATH on Windows (documented workaround in `storefront/CLAUDE.md`). The spec already
  sanctions splitting this: **if the dependency install is not clean, ship the real bounds
  and split the slider to its own backlog item rather than delaying the wave.** Real bounds
  are the substance; the slider is the presentation.

- [ ] **Step 5: Full gate + commit.**

---

## Task 6: Docs closeout

- [ ] Update the triage doc: **Q-13 → NOT REPRODUCED** with the four-surface evidence.
- [ ] BACKLOG WB-120 → done, with real gate numbers and the Q-13 finding.
- [ ] STATUS: active-work entry + test counts.
- [ ] Note whether a Meilisearch reconcile is needed. **Expected: NO** — this wave changes
  how the index is *queried*, not what is *in* it. If Task 3 Step 3 raises
  `maxValuesPerFacet`, that is a settings change requiring a **backend restart** (not a
  reconcile) and must be called out explicitly.
- [ ] `/doc-review`.

## Wave 3 exit criteria

- [ ] Every style tile count equals its listing count — verified against live numbers, not just tests.
- [ ] Bolt pattern (wheels) and Size (tyres) open by default; every collapsed trigger shows its value count.
- [ ] Trending prefers in-stock and badges anything shown out of stock.
- [ ] Price inputs show real catalog bounds.
- [ ] Q-13 recorded as NOT REPRODUCED, with no code written for it.
- [ ] Storefront vitest green, tsc exactly 2, `next build` clean.

## What this wave deliberately does NOT do

- Touch search relevance (WB-122, blocked on a repro).
- Change the style *definitions* — they remain our invented approximations, pending client-input item 8. This wave makes the counts honest, not the groupings.
- Hard-filter out-of-stock products from Trending.
