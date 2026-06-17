# Storefront Phase 2 — Discovery Loop + Deferred Backlog

> _Corrected 2026-06-17 — see [docs/STATUS.md](../../STATUS.md). Original was pre-rename / pre-cents-fix; preserved as historical record below._

This doc tracks the **discovery loop** (land → browse → filter + sort → add vehicle → see only fitting wheels) and keeps an inventory of everything intentionally deferred until that loop closes. Spec 1 shipped the first four steps for wheels; Spec 2 — wheel-size.com fitment + persistent garage — closes the last one. Shipping, checkout, RMA, payment, tax, and other "ending step" gaps are explicitly out of scope until the loop is whole.

Audience for the storefront is **B2C consumers** (end drivers buying for their own vehicle); the B2B portal angle is out of scope.

---

## Start here — your first 30 minutes

The single concrete next action is to **brainstorm Spec 2** (wheel-size.com fitment + persistent garage). One suggested invocation:

> `/superpowers:brainstorming Spec 2 — wheel-size.com lazy-cache fitment + persistent garage. Read STOREFRONT_PHASE2_PLAN.md §"Quickstart" and §"Next — closing the discovery loop" first. The substrate (canonical bolt-pattern join key + DiscoveryQuery.vehicleConstraint seam + swap-ready garage singleton) is already on main from Spec 1; the source decision (wheel-size.com Basic tier) is resolved. The seven open design decisions listed under Spec 2 are the agenda. Out of scope: tire fitment, TPMS sourcing, anything in the deferred backlog.`

If the brainstorm is already done, the implementation entry point is `storefront/src/lib/garage/index.ts` (swap `LocalStorageGarage` → `MedusaGarage`) plus a new `backend/src/modules/wheel-size/` for the API client + cache.

---

## Quickstart for a new conversation

A fresh agent should be able to start work on Spec 2 by walking this section top-to-bottom.

### Read in order

| # | Path | Why |
|---|---|---|
| 1 | [`CLAUDE.md`](../../../CLAUDE.md) | Repo-wide architecture, conditional module loading, vendor-sync pipeline, dollars/cents convention, gotchas. |
| 2 | [`storefront/CLAUDE.md`](../../../storefront/CLAUDE.md) | Storefront app + design-system contract. Discovery and PDP wiring blocks are the most recent state. |
| 3 | [`storefront/DESIGN.md`](../../../storefront/DESIGN.md) | Visual system rules. Read before touching the WB visual layer. |
| 4 | [`vendor-sync-implementation`](../../reference/vendor-sync-implementation.md) | What's in the catalog and how it got there. Background only; Spec 2 doesn't mutate it. |
| 5 | [`docs/done/specs/2026-05-28-fitment-ready-catalog-search-design.md`](../specs/2026-05-28-fitment-ready-catalog-search-design.md) | Spec 1 design. Read §D7 — it defines the safe-fit window Spec 2 inherits. |
| 6 | [`docs/done/plans/2026-05-28-fitment-ready-catalog-search.md`](2026-05-28-fitment-ready-catalog-search.md) | Spec 1 task plan. Useful as a template for Spec 2 plan structure. |
| 7 | [`backend/src/modules/vendor-sync/search/build-search-document.ts`](../../../backend/src/modules/vendor-sync/search/build-search-document.ts) | The per-product Meilisearch transformer. Exactly what the index carries — i.e. the fields Spec 2 filters against. |
| 8 | [`backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts`](../../../backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts) | `canonicalBoltPatterns` — the wheel-size.com join key. Spec 2's highest-risk unit. |
| 9 | [`backend/src/modules/vendor-sync/search/normalize-finish.ts`](../../../backend/src/modules/vendor-sync/search/normalize-finish.ts) | Has a byte-equivalent twin on the storefront PDP. Keep them in lockstep. |
| 10 | [`backend/medusa-config.js`](../../../backend/medusa-config.js) | Meilisearch index settings + transformer wire-up + vendor-sync module options. |
| 11 | [`storefront/src/lib/meilisearch.ts`](../../../storefront/src/lib/meilisearch.ts) | Server-only Meilisearch client (`import "server-only"`, on `meilisearch ^0.51.0`). |
| 12 | [`storefront/src/modules/discovery/data/get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts) | Disjunctive `multiSearch` adapter. The `vehicleConstraint` seam Spec 2 fills lives in `buildFilters`. |
| 13 | [`storefront/src/modules/discovery/data/types.ts`](../../../storefront/src/modules/discovery/data/types.ts) | `DiscoveryQuery` (includes `vehicleConstraint?: string[]`), `DiscoveryFilters`, `FacetCounts`, `SortOption`. |
| 14 | [`storefront/src/modules/product-detail/data/get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts) | Live Medusa Store API PDP loader. `fitment: []` today — Spec 2 populates it. |
| 15 | [`storefront/src/modules/product-detail/data/types.ts`](../../../storefront/src/modules/product-detail/data/types.ts) | `FitmentEntry` shape and `ProductDetail` extension of `DiscoveryProduct`. |
| 16 | [`storefront/src/lib/garage/`](../../../storefront/src/lib/garage/) (`index.ts` + `provider.ts` + `types.ts` + `local-storage-garage.ts` + `use-garage.ts` + `vehicle-data.ts`) | The swap-ready garage abstraction. `types.ts` declares `Vehicle`/`NewVehicle` with the optional fitment fields Spec 2 will populate. Spec 2 swaps the singleton from `LocalStorageGarage` to `MedusaGarage`. |
| 17 | [`storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx) + [`garage-pane.tsx`](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx) | The two panes that write vehicles into the garage and route to `/store`. |
| 18 | [`storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx`](../../../storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx) | Vehicle band lives here; the `TODO(integration)` at L138 marks the "only show wheels that fit" toggle. (L264 carries a sibling TODO for the price-range `<Slider>`.) |

### Inspection commands

```bash
# Confirm Spec 1 is on main.
git log --oneline -8
# Expect: 9f1d395 Merge ... fitment-ready catalog + faceted search

# Backend unit tests for vendor-sync + the search triad
# (the only test script wired up; ~4s, no DB).
cd backend && pnpm test:sync
# Expect: all passing, 0 failing (exact counts: see docs/STATUS.md)

# Confirm a wheel doc shape in Meilisearch.
# MEILISEARCH_HOST + MEILISEARCH_ADMIN_KEY are the BACKEND env-var names
# (backend/.env, used by medusa-config.js). The storefront reads the same
# Meilisearch via NEXT_PUBLIC_SEARCH_ENDPOINT + NEXT_PUBLIC_SEARCH_API_KEY
# in storefront/.env.local — same host, different variable names.
curl -s -X POST "$MEILISEARCH_HOST/indexes/products/search" \
  -H "Authorization: Bearer $MEILISEARCH_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q":"","filter":"product_type = \"wheel\"","limit":1}' | jq '.hits[0]'
# Expect fields: brand, finish, diameters, widths, bolt_patterns,
# bolt_patterns_canonical, offsets, center_bores, price_min (INTEGER CENTS),
# price_max, product_type = "wheel".

# Storefront type-check on touched files (no project-wide tsc gate).
cd storefront && npx tsc --noEmit

# Storefront build without waiting for the backend (use when iterating
# storefront-only; the dev script's await-backend shim otherwise blocks).
cd storefront && pnpm build:next
```

### Environment quirks

- **`pnpm` may not be on Windows PATH.** Use `npx -y pnpm@9.10.0 <cmd>` for one-offs. The Medusa CLI is reachable via `backend/node_modules/.bin/medusa.CMD`.
- **`.medusa/server` is a stale-config cache.** After any `medusa-config.js` or env-var change: `rm -rf backend/.medusa/server` before restart.
- **Backend must run before `storefront pnpm dev` works** — `await-backend` blocks until port 9000 responds. For storefront-only iteration, `pnpm build:next` skips the wait.
- **No storefront unit-test runner.** The gates are `pnpm lint`, `npx tsc --noEmit`, and `pnpm build:next`. E2E (Playwright) exists via `pnpm test-e2e` but isn't wired into the everyday loop. Backend has `pnpm test:sync` (jest, ~4s, no DB) which covers vendor-sync + the search/transformer triad.
- **Two separate `pnpm install`s.** Root has no workspaces; install per app.
- **Build is forgiving by design.** `storefront/next.config.js` sets `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true`. Don't rely on the build to surface type or lint errors — run them separately.
- **`MedusaService` update/create takes a single object.** `service.updateVendorFeedRuns({id, ...fields})`. The two-arg `(selector, update)` form silently no-ops in 2.13.6.

### Architectural gotchas Spec 2 will trip over

- **Dollars in Medusa, integer cents in Meilisearch, dollars × 100 on PDP.** Vendor-sync writes MAJOR units (e.g. `369.99`) onto `prices.amount`; `buildSearchDocument` converts to integer cents via `Math.round(major*100)` for `price_min`/`price_max`; PDP reads `calculated_amount` (dollars) and multiplies by 100 to land in the same cents space. Discovery cards divide `priceCents` by 100 for display. Touching prices in any of these three places without touching the others breaks Discovery ↔ PDP parity.
- **Meilisearch client is `import "server-only"`.** Discovery is server-rendered; do not import `lib/meilisearch.ts` from a client component. The legacy `src/lib/search-client.ts` Algolia/InstantSearch shim is no longer the discovery path.
- **`canonicalBoltPatterns` is the fitment join key.** Output MUST match wheel-size.com's format exactly (`"{count}x{pcd_mm}"`, e.g. `"5x114.3"`) or fitment silently returns zero results. There is no error to chase — Discovery returns no hits and PDP shows no fitment match. **Highest-risk unit in Spec 2.**
- **`normalize-finish.ts` has a byte-equivalent twin on the storefront PDP** (`storefront/src/modules/product-detail/data/get-product.ts`). Keep them in lockstep.
- **`modules/store/` and `modules/products/` are retained.** They are not the canonical Discovery or PDP modules anymore, but `SortOptions`, `RefinementList`, `PaginatedProducts`, and `Thumbnail` are still imported by categories / collections / account / cart / checkout / order code. Leave them.
- **PDP variant collapse.** `mapToDetail` groups variants by `${diameter}x${width}` into `sizeOptions`; sibling offsets accumulate as `offsetVariants`. Availability uses best-of-siblings (`in_stock` > `low_stock` > `out_of_stock`). Per-offset `priceCents` lets the panel price the selected offset, not the size minimum.
- **`fitment: []` in the PDP loader.** The fitment section degrades gracefully on empty today. Spec 2 will populate it from a wheel-size.com `/by_rim/search/` response on first organic visit (TOS forbids pre-fetching).
- **`createProductsWorkflow` does not eagerly populate `variant.inventory_items`.** Irrelevant to Spec 2 unless it touches catalog mutations; the query-graph fetch pattern lives in [`backend/src/modules/vendor-sync/pipeline/apply.ts`](../../../backend/src/modules/vendor-sync/pipeline/apply.ts).

---

## What shipped — Spec 1 (fitment-ready catalog + faceted search)

Merged onto `main` via `9f1d395` (no-ff merge of `feat/vendor-sync-wheel-grouping`). The discovery loop's land/browse/filter/sort steps are live for wheels. Spec 1 closed gap 2.3 for wheels and left a deliberately small substrate for Spec 2 to land on.

### What shipped

**Backend** — three pure files at `backend/src/modules/vendor-sync/search/`:
- [`bolt-pattern-canonical.ts`](../../../backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts) — `canonicalBoltPatterns(input)` → `["{count}x{pcd_mm}"]`, snaps to nearest standard PCD. **The wheel-size.com join key.**
- [`normalize-finish.ts`](../../../backend/src/modules/vendor-sync/search/normalize-finish.ts) — `normalizeFinish(raw)` → `"black" | "bronze" | "silver"`. Precedence: bronze > black-dominance > silver > black default. Byte-equivalent twin on the storefront PDP loader.
- [`build-search-document.ts`](../../../backend/src/modules/vendor-sync/search/build-search-document.ts) — `buildSearchDocument(product)` → flat `WheelSearchDocument` or a `{id, product_type:"non-wheel"}` floor for non-wheels (the plugin coalesces a falsy transformer result to its own default via `?? defaultTransformer`, which would otherwise silently mis-index them). `price_min`/`price_max` are INTEGER CENTS via `Math.round(major*100)`.

Wired in [`backend/medusa-config.js`](../../../backend/medusa-config.js) on the `@rokmohar/medusa-plugin-meilisearch` plugin block, alongside index settings (`filterableAttributes`, `sortableAttributes`, `searchableAttributes`, `displayedAttributes`) tuned for the faceted wheel surface, with widened `fields` so the transformer sees what it needs.

**Vendor-sync price units corrected at source.** MSRP now writes in MAJOR units (dollars) onto Medusa `prices.amount`. The transformer converts to integer cents for the index.

**Storefront — Discovery and PDP both read live data:**
- Discovery (`/store`) — server component reading via [`storefront/src/lib/meilisearch.ts`](../../../storefront/src/lib/meilisearch.ts) + [`storefront/src/modules/discovery/data/get-products.ts`](../../../storefront/src/modules/discovery/data/get-products.ts). Disjunctive `multiSearch` — one hits query + one facet query per dimension in `FACET_FIELDS`, each facet counted with the OTHER filters applied so toggling within a dimension never collapses its own counts. Always scopes to `product_type = "wheel"`. Adapter swallows Meilisearch failures and returns an empty `DiscoveryResult` (never throws).
- PDP (`/products/[handle]`) — [`storefront/src/modules/product-detail/data/get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts) reads live from the Medusa Store API for authoritative price + stock. Variants collapse to a Diameter × Width grid; sibling offsets accumulate as `offsetVariants` and drive best-of-siblings availability + per-offset pricing. `notFound()` propagates through `generateMetadata` and the page.

**Legacy retired.** `/<countryCode>/results/*` and `SearchResultsTemplate` are gone; mock data files are gone; the search drawer routes to `/store?q=<query>`.

### Gap closed

- **2.3 Search facets (wheels).** Done. Tires still pending — different facet axes + a tire grouping rule that does not exist yet in vendor-sync. Carried forward in the deferred backlog.

### Substrate Spec 2 inherits

Three named units, all already on `main`:

| Substrate | Where | What Spec 2 does with it |
|---|---|---|
| `bolt_patterns_canonical` index field | `build-search-document.ts` | The Meilisearch filter clause Spec 2 ANDs into vehicle-filtered Discovery queries. |
| `DiscoveryQuery.vehicleConstraint?: string[]` | `modules/discovery/data/types.ts` + `get-products.ts:buildFilters` | The seam Spec 2 populates with extra clauses derived from the active vehicle's wheel-size.com spec. |
| `canonicalBoltPatterns` util | `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts` | Reused verbatim on the wheel-size.com client side to normalize their PCD output into the same string format we indexed. |

Additionally: PDP fitment is `fitment: []` (UI degrades gracefully on empty); Discovery filter rail's Vehicle band has a `TODO(integration)` for the "only show wheels that fit" toggle.

Spec 1 docs: [spec](../specs/2026-05-28-fitment-ready-catalog-search-design.md) · [plan](2026-05-28-fitment-ready-catalog-search.md).

### Verification on this commit

- Backend `pnpm test:sync` → all passing / 0 failed (exact counts: see docs/STATUS.md).
- Storefront `tsc` clean on the touched files (pre-existing drift in `lib/data/*` and `modules/order/*` is unrelated; see `storefront/CLAUDE.md`).
- `pnpm build:next` compiles.

---

## Next — closing the discovery loop

The active workstream is the **discovery loop**:

> Shopper lands on the site → browses all products → filters and sorts → adds a vehicle → sees only the wheels that fit.

Spec 1 covered land → browse → filter → sort for wheels. The remaining piece is **fitment-match**.

### Spec 2 — wheel-size.com fitment + persistent garage (immediate focus)

**What "done" looks like.** A shopper adds their vehicle (YMM → trim/modification) in the search drawer. From that moment, Discovery can show only wheels that fit, PDP shows whether THIS wheel fits THEIR vehicle, and the garage survives device changes once they log in.

**Resolved (see Open questions, 2026-05-27):**
- Source: **wheel-size.com Basic tier** (~$450/yr, 5k hits/day, single API-key auth).
- Endpoints: `/search/by_model/` (forward: vehicle → fitment specs), `/by_rim/search/` (reverse: wheel size → vehicles).
- `/modifications/` is the leaf — returns trim × body × engine per model-year; drivetrain as a string in `trim_attributes[]`.
- **TPMS is not in the response** (separate sourcing problem; deferred to gap 2.5).
- **TOS forbids bulk pre-fetching or cron-driven cache warming.** Caching is permitted only on responses to human-initiated calls.
- Residual one-time items before build: validate response shape with a Sandbox key against ~5 known vehicles; legal pass on Russia governing law + $100 liability cap + AS-IS disclaimer.

**Safe-fit window (inherited from Spec 1 spec §D7).** Hard gates: exact `canonicalBoltPattern` match AND vehicle hub-bore ≤ wheel center-bore. Soft window: diameter, width, and offset within the aftermarket window wheel-size.com returns. Confirm this is still the bar before implementation begins — it is the strictness threshold Spec 2 lives or dies by.

**Key seam files (Spec 2 will touch most of these).**

| File | Role in Spec 2 |
|---|---|
| `backend/src/modules/wheel-size/` (NEW) | API client + lazy cache + a `WheelSizeService` exposing `getModificationsForVehicle()` and `getFitmentByCanonicalBoltPattern()`. Module is conditionally loaded on `WHEEL_SIZE_API_KEY` presence (same pattern as Stripe / Resend in `medusa-config.js`). |
| `backend/src/modules/wheel-size/migrations/` (NEW) | Cache table(s) — shape is an open design decision (see below). |
| `backend/src/modules/customer-vehicle/` (NEW) | `customer_vehicle` table + service backing MedusaGarage. Linked to Medusa customers. |
| `backend/src/api/store/customer/vehicles/` (NEW) | List / create / set-active / delete endpoints for the persistent garage. |
| `backend/src/api/store/fitment/` (NEW) | Storefront-facing fitment endpoints (vehicle → wheel filter clauses; wheel → fitting vehicles). The only two endpoints that legally fire wheel-size.com calls. |
| `storefront/src/lib/garage/index.ts` | Swap the singleton from `LocalStorageGarage` to `MedusaGarage`. Open: migration path for users with existing LocalStorage entries. |
| `storefront/src/lib/garage/medusa-garage.ts` (NEW) | New implementation of `GarageProvider` backed by the new store endpoints. |
| `storefront/src/lib/garage/provider.ts` | Interface; should not need to change. |
| `storefront/src/lib/garage/local-storage-garage.ts` | Kept as fallback / anonymous-user path. |
| `storefront/src/lib/garage/use-garage.ts` | Hook; should not need to change. |
| `storefront/src/lib/garage/vehicle-data.ts` | Static YMM dataset → replaced by wheel-size.com lookups. |
| `storefront/src/modules/discovery/data/get-products.ts` | Populate `q.vehicleConstraint` from the active vehicle (server-side; the page is a server component). Likely via a small `vehicle → constraint[]` helper that lives next to `buildFilters`. |
| `storefront/src/modules/discovery/data/types.ts` | `DiscoveryQuery.vehicleConstraint?: string[]` — already declared. |
| `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx` (Vehicle band, ~L138) | Wire the `TODO(integration)` "only show wheels that fit" toggle. |
| `storefront/src/modules/product-detail/data/get-product.ts` | Replace `fitment: []` with a call to the storefront fitment endpoint. This call is human-initiated (a PDP visit), so it is TOS-compliant. |
| `storefront/src/modules/product-detail/data/types.ts` | `FitmentEntry` shape — already declared. |
| `storefront/src/modules/product-detail/components/fitment/` | Already degrades gracefully on empty; should bind to the populated `FitmentEntry[]`. |
| `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` + `garage-pane.tsx` | Likely no UX change — the YMM pane already writes to the garage abstraction and routes to `/store`. |
| `backend/src/modules/vendor-sync/search/bolt-pattern-canonical.ts` | Reused verbatim — Spec 2 imports it (or duplicates byte-equivalently if the wheel-size module wants to be import-clean of vendor-sync). **Do not fork the algorithm.** |

**Highest-risk unit.** `canonicalBoltPatterns` format parity with wheel-size.com. We chose `"{count}x{pcd_mm}"` (e.g. `"5x114.3"`); wheel-size.com returns the same format in its `bolt_pattern` field. **Validate this with a real API hit against ~5 known vehicles before any other Spec 2 work.** A silent mismatch returns zero matches and looks like a vehicle-database gap, not a format bug — there is nothing in logs because both sides "worked."

**Open design decisions.** Surface these in the brainstorming pass; suggested-but-not-decided answers in parens.

1. **Cache table shape.** Flat key/value over `(year, make, model, trim, modification_id)`, or one row per `/modifications/` response with normalized projections (a `cached_modifications` parent + `cached_modification_fitment` child)? What about eviction — never, on vendor-sync of a matching wheel, or manual flush only? *(Lean: one row per response, JSON-stored, plus a denormalized `fitment_by_canonical_bolt_pattern` projection table for the read path Discovery uses. The projection is what `vehicleConstraint` consults; the raw response is what PDP fitment reads. Keeps the join key cheap and the source of truth intact. Eviction: never automatic — manual flush only, to preserve TOS compliance.)*
2. **First-render UX when no vehicle is set in the garage.** Show Discovery unfiltered as today, surface a soft prompt in the Vehicle band, or auto-open the search drawer's YMM pane on first visit? *(Lean: unchanged from today — soft prompt only. Auto-opening the drawer is intrusive.)*
3. **What to do when wheel-size.com returns no spec for an obscure trim or a vehicle absent from their dataset.** Persist a `not_found` sentinel and surface a "fitment data unavailable for this vehicle" notice; do not apply `vehicleConstraint`; still let the user shop unfiltered? *(Lean: yes — sentinel + notice + unfiltered shopping. The alternative — silently returning everything — is indistinguishable from a bug.)*
4. **Should Discovery auto-apply `vehicleConstraint` when an active vehicle is set, or only when the "only show fitting" toggle is ON?** *(Lean: toggle-ON, default-OFF. Auto-applying changes what the user sees without an obvious affordance to undo. The Vehicle band already has a `TODO(integration)` for the toggle.)*
5. **Migration path for users with an existing LocalStorage garage when MedusaGarage takes over.** On first authenticated visit, copy LocalStorage entries into the server-backed garage and clear local? Keep LocalStorage as anonymous fallback for un-authed sessions? *(Lean: both — copy-on-login, plus retain `LocalStorageGarage` for anonymous sessions via a small router in the singleton.)*
6. **How to surface "this wheel fits your truck" on PDP while honoring no-bulk-fetch.** A PDP visit is a human-initiated call — we can legally fire `/by_rim/search/` once and cache forever. But we shouldn't fire it for every PDP visit. Cache by canonical wheel signature (brand + bolt pattern + diameter range + offset range + center bore range)? *(Lean: yes — cache keyed by the wheel's canonical signature. First visit = one API call; subsequent visits = cache hit.)*
7. **Safe-fit window strictness — is Spec 1 §D7 still the bar?** Exact bolt pattern (hard) + hub-bore ≤ wheel-bore (hard) + diameter/width/offset within wheel-size.com aftermarket window (soft)? *(Lean: yes, unchanged. The hard gates are what `vehicleConstraint` enforces in Meilisearch; the soft window is informational on PDP.)*

### Other discovery-loop-adjacent work

These belong in the same conversation arc as Spec 2 — they shape what "browse" and "filter" mean — but are smaller and don't block Spec 2.

| Item | Status | Size | Dependency |
|---|---|---|---|
| **Category facet** (Spec 1 G2 deferred). `DiscoveryFilters.categories` exists; facet UI is hidden because vendor-sync creates per-brand collections but no category taxonomy. A category dimension (Trucks/SUVs / Off-Road / Performance / OEM-style) would need either a manual taxonomy pass or an automated rule over `productType` + brand. | hidden | S backend taxonomy + S frontend unhide | Decide taxonomy. |
| **Brand landing pages** (§2.7). Brand collections already exist; needs content fields (logo, description, hero image) and a category-style landing UX. Adjacent because brand is already a facet — landing pages turn the chip click into a richer destination. | not started | S backend + M frontend | Real brand assets. |
| **Tire facets** (deferred portion of §2.3). Different axes (size, load index, speed rating, season/compound) + a tire grouping rule that does not exist yet in vendor-sync (today tires are one-product-per-row). Needs its own spec. | not started | M backend (grouping rule) + S transformer extension + M frontend | None — independent of Spec 2. |
| **Real product photography.** Every photographic element in the Discovery cards and PDP gallery is `<ImgPlaceholder>` today. The vendor thumbnail URL flows through to `thumbnail`, but the design wants face/lip/back angles per finish. | placeholder | M (per-brand asset pipeline) | Vendor or in-house asset feed. |
| **Discovery price-range `<Slider>`.** Currently two `TextInput`s. `TODO(integration)` in the rail. | partial | S | Real min/max range surfaced from Meilisearch. |
| **PDP add-to-cart + wishlist wiring.** `TODO(integration)` in `purchase-panel.tsx`. Today toast-only. | partial | S each | Wishlist needs a Server Action first. |

---

## Future — deferred backlog (until the discovery loop closes)

Everything below is **deferred until the discovery loop closes** (Spec 2 lands). Preserved as a backlog inventory; each row will get its own design + plan in the brainstorming → spec → implementation cycle when picked up.

### Tier definitions

| Tier | Meaning |
|---|---|
| 1 | Blocks the storefront from working at all. Must close before any storefront launch. |
| 2 | Industry differentiators. Without these the site is generic e-com, not a wheels-and-tires site. (The discovery-loop items live here — see §"Next" above.) |
| 3 | Operations. Required before going live to real customers. |
| 4 | Product-data depth and merchandising quality. |
| 5 | Growth/UX. Post-launch optimisation. |

Sizes: S (≤ 1 day), M (2-5 days), L (1-2 weeks), XL (>2 weeks).

### Tier 1 — Blocks the storefront from working at all

| # | Gap | Detail | Size |
|---|---|---|---|
| 1.1 | Shipping options | `ensureShippingProfile` creates the profile but no `shipping_option` rates. Medusa checkout dies at the "select shipping" step until at least one option per region exists. Minimum first cut: a flat-rate per region. | S |
| 1.2 | Payment env | The Stripe provider is conditional on `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET`. Confirm dev/prod has both set. | S |
| 1.3 | Sales tax | Nothing configured today. Wheels/tires also incur state-specific tire-fee surcharges (CA, NY, others — $1-$5/tire for recycling). Two paths: TaxJar/Avalara integration, or manual per-state Medusa tax-rate config. | M-L |
| 1.4 | Customer account smoke test | Verify register/login/reset works end-to-end against current dev DB. Resend templates exist for invite-created and order-placed; password-reset template likely missing. | S |

### Tier 2 — Industry differentiators (non-discovery-loop)

Discovery-loop items (former 2.1 Fitment, 2.2 Garage, 2.3 Search facets — wheels portion) are addressed in §"Next" above. What remains here is the orthogonal Tier-2 work.

| # | Gap | Detail | Dependency | Size |
|---|---|---|---|---|
| 2.3 | Search facets — tires | Wheels done (Spec 1). Tires need separate spec (different axes + tire grouping rule). | — | S spec + M backend + M frontend |
| 2.4 | Set-of-4 quick add | Most wheel orders are 4. PDP default qty = 4, "Buy as set" button, optional lug-kit upsell. Backend already supports quantity; this is mostly storefront. | — | S backend + M frontend |
| 2.5 | TPMS upsell | Tires need TPMS sensors for newer vehicles. Single TPMS SKU offered as a qty-matched upsell on every tire PDP. Backend: manually create TPMS product + a related-product link. TPMS data is not in the wheel-size.com response, so this stays a separate sourcing problem. | — | S backend + M frontend |
| 2.6 | MAP enforcement | Vendor agreements typically forbid publicly displaying MAP. Policy options: show MSRP always, MAP only in cart, MAP only logged-in, click-to-reveal. Today MSRP is the variant price; MAP is in variant metadata but never surfaced. Policy is mostly a business/legal decision; the implementation follows. | — | M |
| 2.7 | Brand landing pages | Surfaced in §"Other discovery-loop-adjacent work" above because it's discovery-loop-adjacent, but it is still Tier 2 by scope. | — | S backend + M frontend |

### Tier 3 — Operations (pre-production)

| # | Gap | Detail | Dependency | Size |
|---|---|---|---|---|
| 3.1 | Carrier shipping | UPS/FedEx/USPS real-time rates. LTL freight threshold for >150lb orders (set of 4 forged wheels). Dimensional weight. Residential surcharge. Some tire compounds are hazmat. | 1.1 | L |
| 3.2 | Multi-warehouse routing | We store stock per vendor warehouse but there's no router. Customer ZIP → choose warehouse(s). Decide: split shipments allowed or single-warehouse-only. | 3.1 | L |
| 3.3 | Drop-ship PO submission | On order placed: charge customer, then submit PO to WheelPros (SFTP or API). State machine: placed → po-submitted → vendor-confirmed → shipped → delivered. | — | L |
| 3.4 | Vendor status webhooks | Acknowledgment, shipped + tracking, backorder, cancellation. Likely polling SFTP for status files rather than real webhooks. | 3.3 | L |
| 3.5 | Inventory reservation + backorder | `vendor_product_current.totalQoh` is a snapshot; vendor stock changes between sync cycles. Customer can checkout 4 wheels we showed in stock and vendor only has 3. Need real-time reservation + backorder fallback. | 3.4 | M-L |
| 3.6 | Returns / RMA | Mounted tires are non-returnable. Wheels: restocking fee policy. Medusa has return workflows; need policy config + customer-facing UI. | — | M |
| 3.7 | Transactional emails | Today: order-placed, invite-created. Need: shipped + tracking, delivered, backorder, refunded, return-approved, return-received. | — | M |

### Tier 4 — Product-data depth

| # | Gap | Detail | Size |
|---|---|---|---|
| 4.1 | Wheel construction | Forged / cast / flow-formed. Not in the current CSV; either parse from PartDescription or accept manual data entry. | S-M |
| 4.2 | Image galleries per finish | One thumbnail today (vendor CDN). Customers expect face/lip/back angles. Vendor sometimes ships a separate photo-set feed. Needs image hosting + pipeline. | M |
| 4.3 | Tire UTQG / load / speed surfacing | All parsed already (loadIndex, speedRating, plyRating). Just need storefront UI to display them. | S |
| 4.4 | Tire compound classification | Performance / All-Season / A/T / M/T / Winter. Sometimes in PartDescription, sometimes Division. Affects fitment recommendations and category filtering. | S |
| 4.5 | Reviews | Build native (months) or buy SaaS (Yotpo, Stamped, Trustpilot — days). | S (SaaS) to L (native) |
| 4.6 | SEO + structured data | Schema.org Product/Offer/AggregateRating, breadcrumbs, sitemap, canonical URLs. Mostly storefront work but some product-level data must come from backend. | M |

### Tier 5 — Growth/UX

| # | Gap | Detail | Size |
|---|---|---|---|
| 5.1 | Wishlists | Server-side persistence so the list survives device changes. | M |
| 5.2 | Related products | Same-brand, same-vehicle, frequently bought together. "Same vehicle" depends on Spec 2. | M (+ depends on Spec 2) |
| 5.3 | Visualizer | "Show this wheel on my truck." Buy not build (Verus, WheelLink). | XL or SaaS |
| 5.4 | Abandoned cart | With vehicle context preserved. | M |
| 5.5 | Analytics | GA4, Meta Pixel. Mostly storefront. | S |
| 5.6 | B2B portal | B2C-only audience; defer indefinitely. | — |

### Recommended phasing (deferred)

These phases stay as orientation but are downstream of the discovery loop.

- **Storefront unblocking (≈ 1 week)** — 1.1, 1.2, 1.3, 1.4, 2.6 (MAP policy + minimum implementation). After this you can launch a generic-but-functional storefront.
- **Production hardening (≈ 2-3 weeks)** — 3.1 → 3.5 in sequence (shipping → routing → PO → webhooks → reservation), 3.6 (RMA), 3.7 (emails). Required before significant real-customer traffic.
- **Merch + SEO (rolling)** — 4.x as merchandising needs demand. 4.5 (reviews) and 4.6 (SEO) before any meaningful traffic acquisition spend.
- **Growth (post-launch)** — 5.x as analytics tell you what moves conversion.

---

## Open questions blocking design work

These are not technical questions; they need information from outside the codebase before the corresponding gap can be designed.

| Gap | Open question |
|---|---|
| Spec 2 Fitment (formerly 2.1) | **Resolved 2026-05-27.** Source: wheel-size.com Basic tier (~$450/yr, 5k hits/day). Schema: `/modifications/` returns trim × body × engine per model-year (drivetrain as a string in `trim_attributes[]`); reverse lookup via `/by_rim/search/`. Commercial use is permitted — we are a customer of fitment data, not a competitor to wheel-size.com itself; caching is permitted on responses to human-initiated calls (no automated bulk fetch or warming). Residual one-time items before build: validate response shape with a Sandbox key against ~5 known vehicles; one-time legal pass on Russia governing law + $100 liability cap + AS-IS data disclaimer; source TPMS data separately for §2.5. |
| 2.6 MAP enforcement | What does the dealer agreement with WheelPros actually require? "MAP" by itself is ambiguous; the legal answer dictates the technical policy. |
| 3.1-3.5 Drop-ship | What channel does WheelPros use for PO submission and status (SFTP folder structure, SFTP file naming, real API endpoint)? Cadence of status files? |
| 1.3 Sales tax | Are you committing to TaxJar/Avalara monthly cost, or building per-state rates manually? Wholesale dealer license sometimes complicates this. |

---

## How this doc relates to design specs

This file is the active roadmap + a backlog inventory. Each gap above, when picked up, gets its own design + plan in the normal **brainstorming → spec → implementation** cycle. Spec 2 (wheel-size.com fitment + persistent garage) is the next one to enter that cycle; everything in the deferred backlog sits behind it. The phasing in §"Recommended phasing" is a recommendation, not a commitment — order is whatever you and I agree on next.
