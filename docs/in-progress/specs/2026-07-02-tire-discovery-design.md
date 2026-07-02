# Tire store — Sub-project 2: Tire discovery — Design

> Date: 2026-07-02. Status: in-progress. Pillar: Discovery (storefront). Backlog: **WB-005** (SP2 of 3).
> SP1 (backend grouping + indexing) is merged: tires are grouped Medusa products indexed in Meilisearch as
> `product_type = "tire"` with facet fields. This sub-project builds the **storefront tire discovery surface** —
> a dedicated `/tires` route with faceted search, so a customer can browse and filter tires. Parent design:
> [2026-07-02-tire-store-design.md](2026-07-02-tire-store-design.md) §3.

## Context

The wheel discovery surface (`storefront/src/modules/discovery/` + the `/store` route) is live and load-bearing.
Its data layer [`get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts) is deeply
wheel-shaped: a wheel `Hit` type + `hitToProduct`, `FACET_FIELDS = ["brand","diameters","bolt_patterns","finishes"]`,
a hardcoded `product_type = "wheel"` scope, and the WB-060 wheel-fitment post-filter. Its output type
[`DiscoveryProduct`](../../../storefront/src/modules/discovery/data/types.ts) is consumed by **16 files** —
all of discovery, four home rails (`new-drops-row`, `catalog-wall`, `featured-blocks`, `get-home-catalog`), and
the entire PDP (`ProductDetail extends DiscoveryProduct`).

The Meilisearch client ([`lib/meilisearch.ts`](../../../storefront/src/lib/meilisearch.ts)) and the single
`products` index are already product-type-agnostic. SP1 emits on each `product_type = "tire"` doc:
`id, handle, title, thumbnail, created_at, brand, skus, tire_sizes[], rim_diameters[], section_widths[],
aspect_ratios[], load_indexes[], speed_ratings[], tire_type, price_min, price_max` (prices = integer cents).

## Decisions made in brainstorming

- **Structure = a parallel `modules/tire-discovery/` module.** The wheel discovery data layer, `DiscoveryProduct`,
  home rails, and PDP are NOT touched — building a generic shared engine would refactor all 16 consumers for no
  user-facing gain and risk the live wheel surface. This mirrors the per-product-type split already chosen on the
  backend (wheel-grouping vs tire-grouping). The trade-off — ~50 lines of duplicated `multiSearch` disjunctive-facet
  logic — is accepted; "extract a shared faceted-search engine" is noted as a future cleanup, not done here.
- **Facet rail = Brand · Rim diameter · Size · Tire type · Speed rating · Load rating · Price.** All are already
  emitted on tire docs by SP1. (The tire analog of wheel's Brand/Diameter/BoltPattern/Finish, plus the
  enthusiast speed/load spec filters.)
- **No fitment.** Tire fitment is out of scope (parent spec). The tire surface renders NO garage/FitmentSync/FITS
  chrome, parses no `fit*` params, and never hits the fitment post-filter path.
- **Reuse generic leaf primitives** (shadcn `Accordion`/`Checkbox`/`Chip`, the `lit` filter-escape helper, and the
  pagination component if it is route-agnostic) but keep the tire facet vocabulary + card + template as their own
  composition.

**Design principle:** the tire surface is a faithful structural mirror of the wheel discovery module, with the
facet vocabulary swapped and the fitment chrome removed. Pure helpers stay unit-tested; the data layer stays
throw-safe (Meili failure → empty result, never a 500).

## Architecture

```
storefront/src/app/[countryCode]/(main)/tires/
  page.tsx            RSC: parse searchParams → getTireDiscoveryProducts → <TireDiscoveryTemplate>
  loading.tsx         <TireDiscoveryTemplateSkeleton>

storefront/src/modules/tire-discovery/
  data/
    types.ts          TireDiscoveryProduct, TireDiscoveryQuery, TireDiscoveryFilters, TireFacetCounts,
                      SORT (reused), parseTireQueryFromSearchParams
    get-tire-products.ts   getTireDiscoveryProducts(query) → TireDiscoveryResult (multiSearch + cache + throw-safe)
    cache-key.ts      tireDiscoveryCacheKey(query) — includes a "tire" discriminant
  use-tire-query.ts   client hook: read/write tire searchParams on the current pathname (setSort/setPage/toggle/clearAll)
  templates/
    index.tsx         TireDiscoveryTemplate (header + chips + rail + grid + pagination)
    skeleton.tsx
  components/
    header/index.tsx        "All tires", "CATALOG · N RESULTS", Sort dropdown
    active-chips/index.tsx  removable chips per active filter + Clear all
    filter-rail/
      index.tsx             desktop <aside>
      filter-sections.tsx   Brand / Rim / Size / Tire type / Speed / Load / Price accordion
      mobile-trigger.tsx    small:hidden drawer trigger reusing filter-sections
      skeleton.tsx
    grid/
      index.tsx             product grid
      tire-product-card.tsx the tire tile
      skeleton.tsx
    empty-state/index.tsx   "No tires match these filters" (+ clear-all recovery)
    pagination            (reuse discovery's if route-agnostic; else a thin tire copy)

storefront/src/modules/layout/…    add a "Tires" nav item (desktop nav + mobile menu)
```

### Data layer — `get-tire-products.ts`

`getTireDiscoveryProducts(query: TireDiscoveryQuery): Promise<TireDiscoveryResult>` mirrors
`getDiscoveryProducts`:

- **Scope:** `buildTireFilters` starts every clause list with `product_type = "tire"`; adds `brand IN [...]`,
  `rim_diameters IN [...]`, `tire_sizes IN [...]`, `tire_type IN [...]`, `speed_ratings IN [...]`,
  `load_indexes IN [...]` (each only when selected), plus `price_min >= / <=` for the price range. Uses the shared
  `lit` escape helper from `discovery/data/escape.ts`.
- **Facets (disjunctive):** `TIRE_FACET_FIELDS = ["brand","rim_diameters","tire_sizes","tire_type","speed_ratings","load_indexes"]`.
  One `multiSearch` batch = 1 hits query (with sort/limit/offset) + one `limit:0` facet query per field, each built
  with that field's own clause skipped (so its distribution counts the OTHER filters) — the exact wheel pattern.
- **Sort:** reuse the wheel `SortOption` union + a `sortExpr` over `price_min`/`created_at`/`title` (all present on
  tire docs). `relevance` → `[]`.
- **`hitToTireProduct`:** maps a tire `Hit` → `TireDiscoveryProduct` (below). `priceCents = price_min`,
  `sizeCount = tire_sizes.length`, `rimDiameters = rim_diameters` (sorted), `isNew` from `created_at` (30-day window).
- **Cache + throw-safety:** wrap `fetchTireDiscoveryProducts` in `unstable_cache` keyed by
  `["tire-discovery", tireDiscoveryCacheKey(query)]`, `revalidate: 60`, `tags: ["discovery","tire-discovery"]`.
  The inner fetch THROWS on Meili failure so the `try/catch → emptyResult` sits OUTSIDE the cache (empties never
  cached, self-heal). `tireDiscoveryCacheKey` carries a `"tire"` discriminant so it can never collide with the wheel
  `"discovery"` key namespace.

### Types — `TireDiscoveryProduct`

```
TireDiscoveryProduct = {
  id, handle, brand, name: string      // name = title = "Falken WDPEAK AT4W"
  priceCents: number                   // integer cents (price_min = min variant price)
  originalPriceCents?: number          // reserved (no tire sale source yet) — omit for now
  thumbnail: string | null
  sizeCount: number                    // tire_sizes.length → "N sizes"
  rimDiameters: number[]               // sorted rim inches → "17"–22"" range
  tireType: "passenger" | "light-truck" | "other"
  isNew?: boolean
}
```

### Tire product card — `tire-product-card.tsx`

Link → `/products/${handle}` (NO `?fit=1` — fitment is out of scope). Renders: thumbnail (fallback = a neutral
tire/placeholder glyph, NOT the wheel `<Wheel>` SVG), NEW chip when `isNew`, a small tire-type badge
(passenger/light-truck), `brand` label, `name`, a `{sizeCount} sizes` line + rim range
(`min"–max"`, or single `N"` when one rim), and price `from $X` (`Math.round(priceCents/100).toLocaleString()`).
No finish swatches, no FITS badge, no `diameter" · boltPattern`.

### URL / query contract (`parseTireQueryFromSearchParams`)

`q` (free-text), `brands`, `rimDiameters` (→ number[]), `sizes` (string[]), `tireTypes` (string[]),
`speedRatings` (string[]), `loadIndexes` (→ number[]), `priceMin`/`priceMax` (→ cents), `sort`, `page`.
No `fit*` params. CSV-or-repeated parsing mirrors the wheel `parseQueryFromSearchParams`.

### Nav + entry points

Add `{ label: "Tires", href: "/tires" }` to BOTH nav arrays:
[desktop nav](../../../storefront/src/modules/layout/templates/nav/index.tsx) (after "Wheels") and the
[mobile menu](../../../storefront/src/modules/layout/components/mobile-menu/index.tsx). The wheel item stays
`active: true` on `/store`; the tire nav-link active state is cosmetic. (Search-drawer tire popular-chips are a
nice-to-have, deferred — the nav link is the entry point.)

## Testing (Vitest)

- `tireDiscoveryCacheKey` — order-independent, stable, carries the `"tire"` discriminant (mirrors the wheel
  cache-key test).
- `buildTireFilters` — the `product_type = "tire"` scope is always present; each selected facet adds its clause;
  the disjunctive `skip` omits the named dimension; price clauses.
- `hitToTireProduct` — field mapping incl. `sizeCount`, sorted `rimDiameters`, `isNew` window, null thumbnail.
- `parseTireQueryFromSearchParams` — CSV/repeated params, number coercion (finite only), sort fallback, page floor.
- The data layer's empty/throw-safety (Meili throws → `emptyResult`, never rejects) — mirror the wheel test.

## Rollout

Storefront-only. `/tires` + the nav link are build-time, so a **storefront rebuild** activates them. No backend,
no migration. Requires SP1 to be live (tire docs in the index) to show real results — until the prod tire feed
apply runs, `/tires` renders the empty state (throw-safe), which is correct.

## Out of scope

- **Tire fitment** (garage/FITS/fit params) — parent spec.
- **Shared generic discovery engine** — deliberate future cleanup; wheel discovery stays as-is.
- **Tire PDP** — SP3.
- **Search-drawer tire popular-chips** — deferred nice-to-have.

## References

- Parent: [tire-store design](2026-07-02-tire-store-design.md) ; SP1 plan
  [2026-07-02-tire-store-backend.md](../plans/2026-07-02-tire-store-backend.md) (done)
- Mirror source: wheel discovery `storefront/src/modules/discovery/` + `/store` route
