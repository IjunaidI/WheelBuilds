# Design — Wheel discovery & vendor-sync ops (G5 + G8-ops)

> Status: in-progress · Date: 2026-06-28 · Backlog: WB-021, WB-046, WB-006, WB-044, WB-052
> Scope: wheel-related hardening only. **Tires (WB-005) explicitly deferred.** Pricing/de-hardcode
> (WB-024/025/026) and the general-commerce reply-to/shipping item (WB-031) are out of scope.

## Why

The wheel customer journey (Home → Discovery → PDP → Cart → Checkout → Garage) is feature-complete
and live. The remaining wheel-related work is **hardening, scale, and operability** on the two
surfaces that serve the wheel catalog: discovery/search (G5) and the vendor-sync pipeline that
builds the catalog (G8 ops). Five small, independent items, one focused session.

## Items & design

### WB-006 · Vendor-sync admin console  [the substantial item]

**Problem.** Vendor-sync is operable only via CLI/API. `backend/src/admin/` is empty boilerplate.
There are 8 working admin routes (list, detail, trigger, approve, cancel, replay-run, replay-sku,
purge) with no UI over them.

**Design.** A Medusa 2.x **admin route extension**, not a widget — vendor-sync has no natural host
page, so it gets its own sidebar destination.

- `backend/src/admin/routes/vendor-sync/page.tsx` — registered with `defineRouteConfig({ label: "Vendor Sync", icon })` so it appears in the admin sidebar.
- Built with `@medusajs/ui` primitives (`Container`, `Table`, `Badge`, `Button`, `Drawer`/`FocusModal`, `Select`, `Prompt` for confirms) and the admin's authenticated fetch + `@tanstack/react-query` (both ship inside the Medusa admin runtime). **No new backend routes** — it consumes the existing `/admin/vendor-sync/*`.
- **Run list** — `GET /admin/vendor-sync/runs?vendor=&status=&limit=&offset=`. Columns: vendor · status (color `Badge`) · started/finished · counts. Vendor + status filters; limit/offset pagination.
- **Trigger** — vendor `Select` + "Run dry-run" button → `POST /admin/vendor-sync/runs { vendor_code, dry_run: true }`.
- **Status-gated row actions**, derived by a **pure helper `actionsForStatus(status): Action[]`** (unit-tested):
  - `awaiting_approval` → **Approve** (`POST …/approve`) + **Cancel** (`POST …/cancel`)
  - `fetching | staging | diffing | applying` → **Cancel**
  - `completed | failed` → **Replay** (`POST …/replay`) — the replay route accepts only these two source statuses
  - terminal others (`cancelled`, `exhausted`, `partially_failed`) → no actions
- **Run-detail drawer** — `GET /admin/vendor-sync/runs/:id`: status, counts, `errors`, `failed_group_keys`; a **Replay-SKU** input (`POST /admin/vendor-sync/skus/:partNumber/replay { vendor_code }`).
- **Confirmation modals** (`Prompt`) on the heavy/destructive actions: Approve (triggers the full apply), Cancel, Replay.
- **Polling** — react-query `refetchInterval` (~3–5s) active only while any visible run is in a non-terminal status.
- **`badgeForStatus(status)`** — second pure helper mapping status → `@medusajs/ui` Badge color, unit-tested.
- **Deliberately excluded:** the `purge-products` route. It is a destructive cutover tool, not routine ops; keeping it out of the everyday console prevents an accidental catalog wipe. Stays CLI/API.

**Testing.** Pure helpers (`actionsForStatus`, `badgeForStatus`) are jest-tested in
`backend/src/admin/routes/vendor-sync/__tests__/`. The React surface is gated by `medusa build`
compiling the admin bundle (no React test runner exists in this repo — consistent with how all
admin/storefront-component code is handled here).

### WB-021 · Cache discovery + home Meili queries

**Problem.** `getDiscoveryProducts` calls the Meilisearch **JS client** (not `fetch`), so Next's
fetch-cache never applies. Home wraps the call in `react.cache()` — per-request dedup only, no
cross-request TTL. Every discovery page load issues a fresh `multiSearch`.

**Design.** Wrap the `multiSearch`-issuing body of `getDiscoveryProducts` in Next
**`unstable_cache`** with **`revalidate: 60`** and tag `["discovery"]` (so a future Meili re-sync
can `revalidateTag("discovery")`). Cache key = a **pure `discoveryCacheKey(query)`** helper
(unit-tested) over the serialized `DiscoveryQuery` (filters, sort, page, vehicleConstraint).
`getHomeCatalog`'s existing `react.cache()` then layers per-request dedup on top.

- 60s is the freshness/load trade: listing tiles may be ≤60s stale on price/stock, acceptable
  because the **PDP reads live** from the Store API.
- The adapter keeps its existing failure-swallowing (empty `DiscoveryResult` on Meili error);
  `unstable_cache` must not cache a thrown error — confirm the empty-result path returns normally.
- `import "server-only"` is preserved; `unstable_cache` is server-only and the function reads no
  cookies/headers, so it's eligible.

**Testing.** `discoveryCacheKey` unit test (distinct queries → distinct keys; identical → identical).
Cache behavior itself verified by reasoning + build (no Meili in unit env).

### WB-046 · Remove the dead category facet

**Problem.** The `categories` facet is declared in the types, prepared in the filter UI
(`CATEGORY_LABELS`: off-road/luxury/street/truck-dually/drag/utv), but **dead** — no category
source exists in the feed, the transformer, or the Meili index. `facets.categories` is hardcoded
`{}` ("no backend source yet"), so the accordion never renders.

**Design.** Remove the scaffolding (matches the **WB-029 "no fabricated content"** precedent):
- `storefront/src/modules/discovery/data/types.ts` — drop `categories` from `DiscoveryFilters` and `FacetCounts`.
- `storefront/src/modules/discovery/data/get-products.ts` — drop the hardcoded `categories: {}`.
- `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx` — remove the category `AccordionItem`, `CATEGORY_LABELS`, and the `hasCategories` gate.
- Sweep any remaining references: `EMPTY_FILTERS`, URL-param parse/serialize, `toggleArrayFilter("categories", …)`, and any `filters.categories` reader. Implementer greps `categories` across `storefront/src/modules/discovery` to confirm zero dangling refs.

**Not touched:** the home **"shop by style"** rail (`STYLE_DEFS`) — a separate predefined-query
mechanism, unrelated to this facet.

**Out of scope (filed, not built):** building a real wheel-style classifier to populate the facet
is a much larger piece; it stays a backlog item rather than expanding this session.

**Testing.** Existing discovery unit tests stay green; build compiles with no dangling refs.

### WB-044 · Rename the teraflex fixtures

**Problem.** "Teraflex" is a real Jeep-suspension brand that does **not** make wheels — a
misleading wheel fixture. 23 occurrences across 6 files (4 tests + 2 CSVs).

**Design.** Rename `Teraflex`/`teraflex` → **`Petrol`** (a genuine WheelPros wheel brand; already
present in this project as `petrol-p3b`). Update in lockstep across:
- `__tests__/build-search-document.test.ts`, `build-metadata.test.ts`, `hash.test.ts`, `wheel-normalize.test.ts`
- `__fixtures__/wheels-small.csv`, `wheels-small-v2.csv`

Handles, group-keys, and assertions move together: `teraflex-nomad-… → petrol-nomad-…`,
`Teraflex|058 → Petrol|058`, etc. Pure rename — no behavior change.

**Testing.** The full vendor-sync jest suite stays green after the rename (run the WHOLE suite, not
just the touched files — a prior session learned this when a sibling test held a stale assertion).

### WB-052 · Scale-safe dev-wipe

**Problem.** `vendor-sync-dev-wipe.ts` collects every row id into memory and issues
`WHERE id IN (…)`; at prod scale (~372k staging rows) knex overflows ("Maximum call stack size
exceeded"). `truncate-state.ts` already does the correct atomic `TRUNCATE … RESTART IDENTITY`.

**Design.** Extract the TRUNCATE into a **shared `truncateVendorState(knex)` helper** (single
source of truth for the table list + SQL), and have **dev-wipe delegate to it** for the state
tables — keeping dev-wipe's `--confirm-host` guard and its optional chunked `--purge-products`
workflow path (already chunked at 50). `truncate-state.ts` is refactored to call the same helper.
Kills the overflow; one implementation.

**Testing.** The shared helper's table list is the asserted unit (pure); the scripts themselves are
DB-side and verified by inspection (no DB in unit env). `--confirm-host` guard logic keeps its
existing behavior.

## Sequencing

One plan, ~6 subagent-driven tasks:
1. WB-006a — pure helpers (`actionsForStatus`, `badgeForStatus`) + tests.
2. WB-006b — the admin route React surface over the existing API routes.
3. WB-021 — `unstable_cache` wrapper + `discoveryCacheKey` + test.
4. WB-046 — remove the dead category facet (+ ref sweep).
5. WB-044 — rename teraflex → Petrol fixtures (+ assertions).
6. WB-052 — shared `truncateVendorState` helper; dev-wipe + truncate-state delegate.

Tasks are independent (different files); order is for review clarity, not hard dependency.
WB-046 and WB-021 both touch `discovery/data` — sequence 3 before 4 (or note the overlap) so the
second rebases cleanly.

## Non-goals

- Tires (WB-005) and any tire grouping/indexing.
- Pricing rules / MAP / multi-currency (WB-024); bootstrap/roster de-hardcode (WB-025/026).
- Reply-to / shipping seed fix (WB-031) — general commerce, not wheel.
- A real wheel-style classifier (would revive WB-046's facet) — backlog, not this session.
- Exposing `purge-products` in the admin UI.
