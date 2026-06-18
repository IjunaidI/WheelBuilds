# Backlog — Wheel Builds

> Source of truth for remaining work. Severity-grouped. Every item has a stable `WB-NNN` id —
> plans and commits reference items by id. Derived from the verified 2026-06-17 audit.
> Keep `status` current (see [../../CLAUDE.md](../../CLAUDE.md) → Documentation workflow).

**Item template**
```
### WB-NNN · <title>   [SEVERITY]
- status: todo            # todo | in-progress | done | wont-fix
- area: <subsystem>
- evidence: <file:line>
- problem: <what's wrong>
- fix: <intended change>
- verify: <a concrete, checkable condition>
- refs: <links to in-progress/future spec+plan, or —>
```

---

## Blockers

### WB-001 · PDP cannot transact (Add to Cart is toast-only)   [BLOCKER]
- status: done
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:43-68
- problem: handleAddToCart/BuyNow/Save only fire a sonner toast; no line item is created; Buy now routes to /checkout with an empty cart.
- fix: call lib/data/cart.ts addToCart with the resolved variant id; remove the toast-only path.
- verify: adding to cart from a PDP persists a cart line item; grep shows a real addToCart call, no toast-only branch.
- done: Add to Cart + Buy Now wired to addToCart for the size×offset variant (variantId threaded onto OffsetVariant + resolveSelectedVariant). Buy Now → checkout?step=address. Save stays toast (no wishlist backend). Verified against live backend (cart line-item persists for the resolved wheel variant) + SSR smoke + resolver unit tests.
- refs: done/specs/2026-06-17-pdp-add-to-cart-design.md · done/plans/2026-06-17-pdp-add-to-cart.md

### WB-002 · Authed garage update/delete/activate all 404 (PK vs client_id)   [BLOCKER]
- status: done
- area: backend/customer-vehicle + storefront/garage
- evidence: backend/src/api/store/customer/vehicles/[id]/route.ts:5,11,23 ; storefront/src/lib/garage/medusa-garage.ts:15,58,67,76
- problem: backend [id] routes resolve by Medusa PK, but the storefront sends client_id as [id]; list/create mask it.
- fix: resolve the [id] routes by client_id (+customer_id) — Option A; storefront unchanged. align activate().
- verify: a logged-in user can rename/delete/activate a vehicle and the change survives reload.
- done: [id] routes resolve by client_id via resolveOwned(); mutate by real PK. Storefront unchanged. Verified by service unit tests (cross-tenant isolation) + live create→update→activate→delete smoke (bogus id 404s).
- refs: done/specs/2026-06-18-garage-authed-mutations-design.md · done/plans/2026-06-18-garage-authed-mutations.md

---

## High

### WB-003 · PDP variant grid collapses bolt patterns   [HIGH]
- status: done
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/data/get-product.ts:53-100 ; storefront/src/modules/product-detail/components/hero/index.tsx:45-47
- problem: the variant grid groups by Diameter × Width only; multiple bolt patterns for the same size collapse into one cell, hiding fitment-critical variants. With WB-001 (cart wired) this can add a wrong-fitment variant to a real cart.
- fix: Approach A — bolt pattern gates the grid. SizeOption becomes bolt-pattern-scoped (group key gains bolt_pattern_raw); the bolt-pattern row filters the size grid; cart resolves by (pattern, size, offset). The previously-cosmetic bolt-pattern row becomes load-bearing.
- verify: a product with two distinct bolt patterns at the same Diameter × Width shows, per selected pattern, a grid scoped to that pattern; switching reflows the grid; Add-to-Cart persists the selected pattern's variant.
- done: SizeOption is now bolt-pattern-scoped (group key gains bolt_pattern_raw) via pure group-sizes.ts; the bolt-pattern row filters the size grid and the cart resolves by (pattern, size, offset). Verified by group-sizes unit tests (same-size-two-patterns → two SizeOptions) + a live Store-API check on a real multi-pattern product.
- refs: done/specs/2026-06-18-pdp-bolt-pattern-axis-design.md · done/plans/2026-06-18-pdp-bolt-pattern-axis.md

### WB-004 · Home FEATURED BLOCKS + BUILD GALLERY fabricated content   [HIGH]
- status: todo
- area: storefront/home
- evidence: storefront/src/modules/home/components/featured-blocks/index.tsx:17-60 ; storefront/src/modules/home/components/build-gallery/index.tsx:6-15
- problem: Featured Blocks and Build Gallery render hardcoded placeholder images/text; no real content source exists.
- fix: replace with real CMS-driven or Medusa-collection-backed content, or remove sections entirely until content is available.
- verify: Featured Blocks and Build Gallery render real content (or are removed); no hardcoded placeholder images remain.
- refs: —

### WB-005 · Tires never grouped + never indexed in Meili   [HIGH]
- status: todo
- area: backend/vendor-sync + backend/search
- evidence: backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts:56 ; backend/src/modules/vendor-sync/pipeline/apply.ts:314-326 ; backend/src/modules/vendor-sync/search/build-search-document.ts:36
- problem: tire records go through the per-SKU one-product-per-row path with no grouping rule; buildSearchDocument returns a non-wheel stub for tires so they are not indexed in Meilisearch for discovery.
- fix: define a tire grouping rule (e.g. Brand + SectionWidth + AspectRatio + RimDiameter) and add a tire transformer branch to buildSearchDocument so tires appear in search.
- verify: after a tire feed apply, tires appear as grouped Medusa products with multiple variants; Meilisearch contains tire documents with product_type = "tire".
- refs: —

### WB-006 · No admin UI for vendor-sync (API/CLI only)   [HIGH]
- status: todo
- area: backend/admin
- evidence: backend/src/admin/ (boilerplate)
- problem: vendor-sync management (triggering runs, approving, cancelling, replaying) is only accessible via API or CLI; no Medusa admin widget exists.
- fix: implement a Medusa admin extension widget for vendor-sync (run list, approve/cancel/replay actions, run status display).
- verify: the Medusa admin (/app) shows a vendor-sync section where an admin can trigger a dry-run, view staged diffs, and approve or cancel a run without using the CLI.
- refs: —

### WB-007 · `hub_bore_mm` INTEGER truncates fractional bore on cached reads   [HIGH]
- status: todo
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/migrations/Migration20260601111311.ts:13
- problem: hub_bore_mm is stored as INTEGER in the wheel-size cache table; fractional bore values (e.g. 60.1, 67.1) are truncated on insert and returned as wrong integers.
- fix: change the column type to DECIMAL or FLOAT in a new migration so fractional bore values round-trip correctly.
- verify: a wheel-size lookup for a vehicle with a fractional hub bore returns the correct decimal value from the cache; the migration runs without errors.
- refs: —

### WB-008 · No fitment cache TTL + no warm/refresh cron   [HIGH]
- status: todo
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:52-83
- problem: wheel-size lookup results are cached indefinitely; there is no TTL, no staleness check, and no background job to refresh the cache — stale fitment data persists forever.
- fix: add a TTL column to the cache table and a cron (or cache-aside refresh) that re-fetches entries older than N days from the wheel-size API.
- verify: a cache entry older than the TTL is refreshed on next read (or by cron); entries within TTL are served from cache without an API call.
- refs: —

### WB-009 · `product.fitment = []` (reverse-fitment "N confirmed models")   [HIGH]
- status: todo
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/data/get-product.ts:159
- problem: the PDP loader hard-returns an empty fitment array; the "N confirmed models" PDP section always shows zero/empty regardless of actual wheel-size data.
- fix: implement the reverse-fitment lookup (query wheel-size cache by product bolt patterns/bore/offset ranges) and populate product.fitment with matching vehicle strings.
- verify: a wheel product with known fitment data shows a non-empty "confirmed models" list on the PDP.
- refs: —

### WB-010 · No startup warning for silently-disabled modules   [HIGH]
- status: todo
- area: backend/config
- evidence: backend/medusa-config.js:114-275
- problem: optional modules (Redis, Stripe, Resend, MinIO, Meilisearch, vendor-sync) are conditionally registered; when env vars are missing the module silently does not load with no log output — hard to diagnose in production.
- fix: add a startup log for each optional module indicating whether it is enabled or disabled and which env var controls it.
- verify: starting the backend without optional env vars prints a clear per-module enabled/disabled log line; no module is silently absent without a log.
- refs: —

---

## Move-to-queue (synchronous-in-request / non-durable → background job)

### WB-011 · Manual trigger runs full sync in-request   [MEDIUM]
- status: todo
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/route.ts:63-69
- problem: the POST /admin/vendor-sync/runs endpoint runs the full sync pipeline synchronously inside the HTTP request handler; large feeds will timeout or block the server.
- fix: enqueue the sync as a background job (workflow or queue) and return a run id immediately; the client polls for status.
- verify: POST /admin/vendor-sync/runs returns a run id immediately (< 1s); the sync proceeds in the background; the run status transitions to completed/failed asynchronously.
- refs: —

### WB-012 · Approve-and-apply blocks the request (heaviest apply)   [MEDIUM]
- status: todo
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts:28
- problem: the approve endpoint calls the full apply pipeline synchronously; the apply can take minutes for large feeds, causing HTTP timeouts.
- fix: move apply to a background job triggered by the approve action; return 202 Accepted with a status poll URL.
- verify: POST approve returns 202 in under 1s; apply proceeds in the background; the run transitions from approved → applying → completed/failed asynchronously.
- refs: —

### WB-013 · Replay run / replay SKU block the request   [MEDIUM]
- status: todo
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/[id]/replay/route.ts:26
- problem: replay endpoints run synchronously in-request, same issue as approve (WB-012).
- fix: enqueue replay as a background job; return 202 with a status poll URL.
- verify: POST replay returns 202 in under 1s; replay proceeds in background; run status updates asynchronously.
- refs: —

### WB-014 · Apply loop sequential; `applyConcurrency` is dead config   [MEDIUM]
- status: todo
- area: backend/vendor-sync/pipeline
- evidence: backend/src/modules/vendor-sync/pipeline/apply.ts:148-201
- problem: the apply loop processes one product group at a time sequentially; the `applyConcurrency` config option is read but never used — it is dead configuration.
- fix: implement a real concurrency limit using the applyConcurrency value (p-limit or similar) so multiple product groups are applied in parallel up to the configured limit.
- verify: with applyConcurrency = 3, the apply loop processes up to 3 product groups concurrently; the config value is actually respected.
- refs: —

### WB-015 · CSV read fully into memory + parsed before yielding   [MEDIUM]
- status: todo
- area: backend/vendor-sync/adapters
- evidence: backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts:18-24
- problem: the CSV parser reads the entire file into memory before yielding records; large feeds risk OOM errors and delay time-to-first-record.
- fix: switch to a streaming CSV parse that yields records as they are parsed (e.g. csv-parse stream API).
- verify: parsing a large feed does not load the full file into memory at once; the first record is available before the file is fully read (testable by timing or memory profiling).
- refs: —

### WB-016 · Failed parts never auto-retried (cron RunDate then skips feed)   [MEDIUM]
- status: todo
- area: backend/vendor-sync/service
- evidence: backend/src/modules/vendor-sync/service.ts:354-362,219-242
- problem: when some product groups fail during apply, the run still transitions to completed; the next cron cycle sees the same RunDate and short-circuits without retrying the failed parts.
- fix: track per-group failure; mark a run with partial failures as partially-failed (not completed); have the cron re-run failed groups on the next cycle rather than skipping the feed.
- verify: a run with one failed group is not marked completed; the next cron cycle retries the failed group; a fully-successful retry transitions the run to completed.
- refs: —

### WB-017 · Feed archives → ephemeral disk; `archiveBucket` unused   [MEDIUM]
- status: todo
- area: backend/vendor-sync/utils
- evidence: backend/src/modules/vendor-sync/utils/archive.ts:12-39
- problem: feed archives are written to local disk; on Railway the disk is ephemeral and archives are lost on redeploy; the archiveBucket config option is present but never used.
- fix: implement archive upload to the configured object storage bucket (MinIO/S3) using the existing archiveBucket option. See also WB-042 (durable archiving — deferred Plan 4+).
- verify: after a sync run, the feed archive is uploaded to object storage and persists across server restarts; archiveBucket config drives the destination.
- refs: —

### WB-018 · Stock freshness bound to 12h run; no stock-only fast path   [MEDIUM]
- status: todo
- area: backend/vendor-sync/jobs
- evidence: backend/src/jobs/vendor-sync-tick.ts:33-36
- problem: inventory levels are only updated as part of the full 12h catalog sync; there is no way to refresh stock counts more frequently without triggering a full diff-and-apply.
- fix: add a stock-only fast path (separate cron or manual trigger) that updates inventory_item quantities from the feed without re-diffing product/variant metadata.
- verify: a stock-only sync updates inventory levels without creating/modifying product or variant records; it can be run independently of the full 12h sync.
- refs: —

### WB-019 · wheel-size lookup synchronous on first miss   [MEDIUM]
- status: todo
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:64
- problem: on a cache miss the wheel-size API call blocks the request synchronously; slow or unavailable wheel-size API stalls fitment-dependent requests.
- fix: make the lookup async/non-blocking on miss — return an empty fitment result immediately and populate the cache in the background, or use a queue.
- verify: a cache miss for a vehicle does not block the caller's request; the cache is populated asynchronously and subsequent requests return the result.
- refs: —

### WB-020 · Quota counter non-atomic read-modify-write   [MEDIUM]
- status: todo
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:38-46
- problem: the API quota counter is implemented as a read-then-write in application code; concurrent requests can race and exceed the quota limit.
- fix: use a database-level atomic increment (UPDATE ... SET count = count + 1 RETURNING count) or a Redis counter for the quota check.
- verify: under simulated concurrency, the quota counter does not exceed the configured limit; no over-counting race is possible.
- refs: —

### WB-021 · Discovery + home Meili queries uncached (no TTL/revalidate)   [MEDIUM]
- status: todo
- area: storefront/discovery + storefront/home
- evidence: storefront/src/modules/discovery/data/get-products.ts:137-202 ; storefront/src/modules/home/data/get-home-catalog.ts:22
- problem: every discovery page load and home page load issues live Meilisearch queries with no caching; high traffic will hammer Meilisearch unnecessarily.
- fix: add Next.js fetch cache / revalidate options (or unstable_cache) to the Meilisearch query functions so results are cached with a reasonable TTL (e.g. 60s).
- verify: repeated discovery/home requests within the TTL do not re-query Meilisearch; a cache hit is observable (e.g. via Meilisearch query logs or Next.js cache headers).
- refs: —

### WB-022 · Guest→login garage merge = N best-effort client POSTs   [MEDIUM]
- status: todo
- area: storefront/garage
- evidence: storefront/src/lib/garage/index.ts:38-43
- problem: when a guest logs in, the garage merge sends N individual POST requests from the client for each local vehicle; any failure silently drops vehicles and the merge is not atomic.
- fix: implement a server-side merge endpoint that accepts the full local garage state and merges it atomically, or use a Medusa workflow to ensure all-or-nothing persistence.
- verify: a guest with 3 local vehicles who logs in ends up with all 3 vehicles in their authed garage; a network failure during merge is retried or clearly surfaced.
- refs: —

### WB-023 · Newsletter signup is a fake `setTimeout`, nothing persisted   [MEDIUM]
- status: todo
- area: storefront/home
- evidence: storefront/src/modules/home/components/newsletter/index.tsx:14-26
- problem: the newsletter signup handler uses a setTimeout to fake a loading state; no email is captured, no API is called, nothing is persisted.
- fix: wire the newsletter signup to a real email-capture backend (Resend audience, Sendgrid list, or a Medusa custom table); remove the fake setTimeout.
- verify: submitting the newsletter form stores the email address in a persistent store; the email is retrievable after a server restart.
- refs: —

---

## De-hardcode (literal → config / DB / admin / feed)

### WB-024 · Pricing MSRP-only, USD-only, no markup/MAP/margin rule   [MEDIUM]
- status: todo
- area: backend/vendor-sync/pipeline
- evidence: backend/src/modules/vendor-sync/pipeline/apply.ts:357,417,710
- problem: all prices are set directly from vendor MSRP with no support for markup rules, MAP enforcement, margin floors, or multi-currency; USD is hardcoded throughout.
- fix: introduce a pricing rule abstraction (config-driven or admin-managed) that applies markup/MAP/margin on top of MSRP before writing to Medusa; add currency config.
- verify: a configured markup rule (e.g. +10%) is reflected in Medusa prices after apply; changing the rule and re-applying updates prices accordingly.
- refs: —

### WB-025 · Bootstrap identity literals (region/channel/categories/warehouse/brand) hardcoded   [MEDIUM]
- status: todo
- area: backend/vendor-sync/pipeline
- evidence: backend/src/modules/vendor-sync/pipeline/bootstrap.ts
- problem: region, sales channel, categories, warehouse, and brand identifiers are hardcoded literals in bootstrap.ts; changing them requires code changes.
- fix: move bootstrap identity values to config (medusa-config.js vendor options or a seed-controlled admin record) so they can be changed without code changes.
- verify: changing a bootstrap identity (e.g. warehouse name) in config and running bootstrap creates/uses the new identity without modifying bootstrap.ts.
- refs: —

### WB-026 · Vendor roster is a fixed 2-entry object   [MEDIUM]
- status: todo
- area: backend/config
- evidence: backend/medusa-config.js:200-211
- problem: the vendor adapter roster is a hardcoded 2-entry object in medusa-config.js; adding a new vendor requires editing the config file directly.
- fix: make the vendor roster config-driven (e.g. load from env-specified JSON or a DB table) so new vendors can be added without code changes.
- verify: a new vendor entry can be activated by changing config (not source code) and appears in the vendor-sync run list.
- refs: —

### WB-027 · `devMaxRows` truncation keyed off `NODE_ENV` (staging trap)   [MEDIUM]
- status: todo
- area: backend/config
- evidence: backend/medusa-config.js:81-83
- problem: devMaxRows feed truncation is active whenever NODE_ENV !== 'production'; a staging environment running with NODE_ENV=staging silently gets truncated feeds and reduced catalog.
- fix: key devMaxRows off a dedicated env var (e.g. DEV_MAX_ROWS) rather than NODE_ENV so staging environments can run full feeds explicitly.
- verify: a server running NODE_ENV=staging with DEV_MAX_ROWS unset processes the full feed; devMaxRows only truncates when DEV_MAX_ROWS is explicitly set.
- refs: —

### WB-028 · Storefront merchandising/policy copy hardcoded   [MEDIUM]
- status: todo
- area: storefront/home + storefront/pdp
- evidence: storefront/src/modules/home/components/trust-strip/index.tsx:5-13 ; storefront/src/modules/home/components/hero/index.tsx:27-32,61 ; storefront/src/modules/home/components/shop-by-style/style-map.ts:25-32 ; storefront/src/app/[countryCode]/(main)/page.tsx:13-17
- problem: merchandising copy (trust strips, hero step labels, shop-by-style category map, page title brand count) is hardcoded in component files; changing copy requires code changes.
- fix: move merchandising copy to a config object, CMS, or environment variable so it can be updated without code changes.
- verify: changing a trust-strip message or hero label in config (not component source) updates the rendered storefront without a code deploy.
- refs: —

### WB-029 · PDP placeholders (qty default, construction/origin/warranty, low-stock threshold, ship copy)   [MEDIUM]
- status: todo
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/data/get-product.ts ; storefront/src/modules/product-detail/components/hero/purchase-panel.tsx
- problem: PDP displays hardcoded placeholder values: quantity defaults to 4, construction/origin/warranty fields show "—", low-stock threshold is hardcoded at ≤4, shipping copy is placeholder text.
- fix: source qty default and low-stock threshold from config; populate construction/origin/warranty from product metadata (vendor feed or admin); replace ship copy with real content.
- verify: a product with construction metadata in its Medusa record shows that value on the PDP instead of "—"; qty default and low-stock threshold come from config.
- refs: —

### WB-030 · `normalizeFinish` hand-synced twin across apps   [MEDIUM]
- status: todo
- area: backend/vendor-sync/search + storefront/pdp
- evidence: storefront/src/modules/product-detail/data/get-product.ts:29-36 + backend/src/modules/vendor-sync/search/normalize-finish.ts
- problem: normalizeFinish is duplicated verbatim between the backend search transformer and the storefront PDP loader; the two copies must be kept in lockstep manually — any divergence silently mismatches finish labels between discovery and PDP.
- fix: extract normalizeFinish into a shared package or a backend API response field so there is a single source of truth; the storefront reads the normalized value rather than re-computing it.
- verify: changing the normalizeFinish logic in one place propagates to both discovery and PDP; there is no second copy to update.
- refs: —

### WB-031 · Seeded shipping options + placeholder `replyTo info@example.com`   [MEDIUM]
- status: todo
- area: backend/seed + backend/email
- evidence: backend/src/scripts/seed.ts:247,285 ; backend/src/subscribers/order-placed.ts:24
- problem: seed.ts creates placeholder shipping options (unrealistic rates); order-placed.ts uses replyTo info@example.com which will appear in real order confirmation emails.
- fix: replace seed shipping options with realistic rates (or make them config-driven); replace info@example.com with a real reply-to address from env config.
- verify: order confirmation emails show a real reply-to address (not info@example.com); seeded shipping options reflect realistic rates.
- refs: —

---

## Medium (other remaining)

### WB-032 · Account has no Garage tab/route   [MEDIUM]
- status: todo
- area: storefront/account
- evidence: storefront/src/modules/account/components/account-nav/index.tsx:117-152
- problem: the account navigation has no Garage entry; there is no /account/garage route where a logged-in user can view or manage their saved vehicles.
- fix: add a Garage tab to the account nav and implement /account/garage as a route that renders the authed garage component.
- verify: a logged-in user can navigate to /account/garage and see their saved vehicles; the Garage tab appears in the account sidebar.
- refs: —

### WB-033 · Direct nav to `/checkout` stalls (no default `?step=`)   [MEDIUM]
- status: todo
- area: storefront/checkout
- evidence: storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx:43-68
- problem: navigating directly to /checkout without a ?step= query param causes the checkout page to stall or render in an indeterminate state rather than redirecting to the first step.
- fix: add a redirect from /checkout (no step param) to /checkout?step=address (or the appropriate first step) so direct navigation works correctly.
- verify: navigating to /<countryCode>/checkout without ?step= redirects to the address step and renders the checkout form correctly.
- refs: —

### WB-034 · Cart qty capped at hardcoded 10, ignores live stock   [MEDIUM]
- status: todo
- area: storefront/cart
- evidence: storefront/src/modules/cart/components/item/index.tsx:45-47
- problem: the cart item quantity selector is capped at 10 regardless of actual inventory; a product with 2 in stock allows qty 10; a product with 50 in stock caps at 10.
- fix: fetch live inventory quantity for each cart item variant and use it as the max qty; fall back to a configurable cap if inventory is unavailable.
- verify: the cart qty selector cap matches the actual inventory level for the variant; a variant with 3 in stock caps at 3, not 10.
- refs: —

### WB-035 · Express Pay / Affirm are non-functional chrome   [MEDIUM]
- status: todo
- area: storefront/checkout
- evidence: storefront/src/modules/checkout/components/express-pay/index.tsx ; storefront/src/modules/checkout/components/checkout-summary/index.tsx:183-189
- problem: Express Pay and Affirm buttons are rendered as UI chrome with no real payment provider integration; clicking them does nothing or shows a stub.
- fix: either integrate real Express Pay (Stripe Link, Apple Pay, Google Pay) and Affirm providers, or remove the buttons until providers are available.
- verify: Express Pay and Affirm buttons either complete a real payment flow, or are entirely absent from the UI (no non-functional chrome).
- refs: —

### WB-036 · Gift card / discount-remove stubbed or buggy   [MEDIUM]
- status: todo
- area: storefront/cart + storefront/checkout
- evidence: storefront/src/lib/data/cart.ts:244-285 ; storefront/src/modules/checkout/components/discount-code/index.tsx:26-33
- problem: gift card redemption and discount code removal are either stubbed out or have bugs; the discount-code UI component does not correctly remove applied codes.
- fix: implement working gift card apply/remove and discount code remove using the Medusa cart API; test the full apply→remove flow.
- verify: applying and then removing a discount code from the cart correctly removes the discount; gift card redemption applies the credit to the order total.
- refs: —

### WB-037 · Cancel flag is per-process in-memory (worker-mode split)   [MEDIUM]
- status: todo
- area: backend/vendor-sync/service
- evidence: backend/src/modules/vendor-sync/service.ts:56,84-94
- problem: the cooperative cancellation flag for vendor-sync runs is stored in-process memory; in worker-mode-split deployments (WORKER_MODE=worker), cancellation sent to the HTTP server process does not reach the worker process running the sync.
- fix: move the cancellation flag to a shared store (Redis key or DB column) so it is visible across processes.
- verify: sending a cancel request to the HTTP server while a sync runs in a separate worker process causes the worker to stop processing; the run transitions to cancelled.
- refs: —

### WB-038 · Partial-apply marked completed → cron skips feed — merged into WB-016. See WB-016.

### WB-039 · CORS undefined if env unset (no safe default)   [MEDIUM]
- status: todo
- area: backend/config
- evidence: backend/src/lib/constants.ts:33-43
- problem: if BACKEND_CORS env var is unset, the CORS allowed-origins list is undefined; this may silently allow all origins or reject all origins depending on Medusa's fallback behavior.
- fix: add a safe default (e.g. localhost origins for dev, fail-loudly if unset in production) so CORS behavior is always explicit.
- verify: starting the backend without BACKEND_CORS set either logs a clear warning with the applied default or fails with an actionable error; CORS does not silently allow all origins in production.
- refs: —

### WB-040 · No committed deploy config (railway.json/Dockerfile/Procfile)   [MEDIUM]
- status: todo
- area: backend/infra + storefront/infra
- evidence: repo root
- problem: there is no committed railway.json, Dockerfile, or Procfile; Railway deployment configuration lives only in the Railway dashboard and is not reproducible from the repo.
- fix: commit railway.json (or Dockerfile/Procfile) for both backend and storefront services so deployment config is version-controlled and reproducible.
- verify: a fresh Railway project can be configured entirely from the committed deploy config without manual dashboard steps.
- refs: —

### WB-041 · SFTP has no fail-loud guard → silently syncs sample CSV if env unset   [MEDIUM]
- status: todo
- area: backend/vendor-sync/feed-source
- evidence: backend/src/modules/vendor-sync/feed-source/resolve-feed.ts ; backend/src/modules/vendor-sync/adapters/wheelpros-wheels/index.ts:19
- problem: if SFTP env vars are unset, the feed resolver falls back to the local sample CSV silently; a production server with misconfigured SFTP env vars will silently sync stale sample data.
- fix: add a fail-loud guard that throws (or logs a prominent warning) when SFTP is expected (e.g. NODE_ENV=production) but env vars are missing; only fall back to sample CSV in explicit dev mode.
- verify: starting vendor-sync in production mode without SFTP env vars throws an error or logs a prominent warning rather than silently falling back to sample data.
- refs: —

---

## Deferred (Plan 4+, from master roadmap — still valid)

### WB-042 · Durable feed archiving to object storage — merged into WB-017. See WB-017.

### WB-043 · wheel-size live-slug verification (no test proves dropdown slugs resolve)   [LOW]
- status: todo
- area: backend/wheel-size + storefront/fitment
- evidence: backend/src/modules/wheel-size/service.ts:52-83
- problem: there is no test that proves the YMM dropdown slug values used in the storefront resolve correctly against the live wheel-size `by_model` API endpoint; slug format could be wrong without detection.
- fix: add an integration test (or a manual verification doc) that confirms at least one make/model/year slug round-trips through the live API and returns fitment data.
- verify: a test or documented manual step confirms that a real YMM slug fetched from the dropdown resolves to wheel fitment data from wheel-size.com `by_model`.
- refs: —

### WB-044 · Rename `teraflex` test fixtures/handles   [LOW]
- status: todo
- area: backend/vendor-sync/tests
- evidence: backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts:5,44 ; backend/src/modules/vendor-sync/__fixtures__/*.csv
- problem: test fixtures and handles still use the old `teraflex` name (pre-rename to wheelpros); they are functionally correct but misleading and inconsistent with the live codebase naming.
- fix: rename teraflex fixture files and update all handle references in the test file to wheelpros equivalents.
- verify: grep for "teraflex" in backend/src/modules/vendor-sync/__tests__/ and __fixtures__/ returns no matches; all tests still pass after rename.
- refs: —

### WB-045 · License-plate lookup is a disabled stub   [LOW]
- status: todo
- area: storefront/fitment
- evidence: storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx:353-365
- problem: the license-plate lookup tab in the YMM pane is rendered but disabled/stubbed; no real lookup provider is wired up.
- fix: either integrate a license-plate-to-YMM lookup API (NHTSA or similar) or remove the tab until a provider is chosen.
- verify: the license-plate lookup either returns a real vehicle match for a valid plate+state, or the tab is entirely absent from the UI (no disabled stub).
- refs: —

### WB-046 · Category facet is dead in discovery (no backend source)   [LOW]
- status: todo
- area: storefront/discovery + backend/search
- evidence: storefront/src/modules/discovery/data/get-products.ts:117,184
- problem: the category facet is listed in FACET_FIELDS and rendered in the discovery UI, but no category data is written to the Meilisearch index by the vendor-sync transformer; the facet always returns empty.
- fix: populate a category field in the Meilisearch wheel document from the vendor feed data (e.g. product category or type) and wire it to the category facet.
- verify: the category facet in discovery shows real options sourced from indexed wheel documents; filtering by category returns matching products.
- refs: —

---

## Low (doc/cosmetic)

### WB-047 · Stale "Medusa Store" / "test order" copy   [LOW]
- status: todo
- area: storefront/order + storefront/checkout
- evidence: storefront/src/modules/order/components/onboarding-cta/index.tsx:11-23 ; storefront/src/modules/checkout/components/review/index.tsx:42-45
- problem: order confirmation and checkout review components still show Medusa boilerplate copy ("Medusa Store", "test order", etc.) instead of Wheel Builds branded text.
- fix: replace all Medusa boilerplate copy with Wheel Builds branded equivalents in the affected components.
- verify: grep for "Medusa Store" and "test order" in storefront/src/modules/order/ and storefront/src/modules/checkout/ returns no matches; components show WB-branded copy.
- refs: —
