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

## Work groups (epics)

> Thematic groupings of the open items below, each sized for roughly one session
> (brainstorm → spec → plan → execute one group at a time). Members list the **open**
> `WB-NNN` as of 2026-06-23; the per-item `status` further down is the source of truth — when an
> item flips to `done`, drop it from its group here. **Completed groups:** *Six-axis wheel variant
> model* (WB-051) and *Wheel-size fitment hardening* (WB-007/008/019/020/043) — 2026-06-23;
> *G3 · PDP correctness & polish* (WB-048/029/030) — 2026-06-25;
> *G2 · Checkout & cart transactable* (WB-033/034/035/036/047 + WB-053) — 2026-06-26
> (gift cards split to WB-054; remaining brand copy to WB-055);
> *G4 · Home & merchandising real content* (WB-004/023/028) — 2026-06-26
> (newsletter hardening split to WB-057);
> *G7 · Account & garage* (WB-032/022/045) — 2026-06-26
> (license-plate provider split to WB-058).

- **G1 · Vendor-sync productionization (async + scale)** `[L · needs Redis worker]` — move sync triggers off the HTTP request, parallelize/stream the apply, make cancel + feed archiving worker-safe. → WB-011, WB-012, WB-013, WB-014, WB-015, WB-017, WB-018, WB-037
- **G2 · Checkout & cart (make it transactable)** `[M–L]` — ✅ **DONE 2026-06-26** (WB-033 stall, WB-034 stock cap, WB-035 express-pay/Affirm env-gated, WB-036 discount fix, WB-047 copy + WB-053 browse cap). Follow-ups: WB-054 (gift cards v2), WB-055 (brand-copy sweep).
- **G3 · PDP correctness & polish** `[S–M]` — ✅ **DONE 2026-06-25** (WB-048 BLANK gate, WB-029 placeholders, WB-030 finish-normalizer twin).
- **G4 · Home & merchandising** `[M]` — ✅ **DONE 2026-06-26** (WB-004 Featured Blocks real curated products + Build Gallery → catalog-wall, WB-023 newsletter persistence, WB-028 merchandising copy → config + live brand count). Follow-up: WB-057 (newsletter hardening — unsubscribe/rate-limit/double-opt-in).
- **G5 · Discovery & search** `[S]` — ✅ **DONE 2026-06-28** (WB-021 Meili result cache via `unstable_cache`, WB-046 dead category facet removed). (browse `maxTotalHits` cap WB-053 ✅ done 2026-06-26 via G2.)
- **G6 · Catalog breadth & pricing** `[L–XL · WB-005 is a big spec alone]` — **← NEXT STEP (2026-07-01): wheel work is complete, so tires is unblocked and up next.** Tires grouping+indexing (WB-005 — define a grouping rule + a `buildSearchDocument` tire branch so tires become grouped, discoverable products), then markup/MAP/margin pricing, de-hardcode bootstrap identity + vendor roster. Start WB-005 with its own brainstorm → spec → plan. → WB-005, WB-024, WB-025, WB-026
- **G7 · Account & garage** `[S–M]` — ✅ **DONE 2026-06-26** (WB-032 account Garage tab/route + GarageManager, WB-022 atomic guest→login merge w/ stable idempotent client_ids, WB-045 removed license-plate stub). Follow-up: WB-058 (real plate→YMM provider).
- **G8 · Admin & ops tooling** `[S]` — admin UI + ops slice ✅ **DONE 2026-06-28** (WB-006 vendor-sync admin console, WB-044 rename `teraflex` fixtures, WB-052 scale-safe dev-wipe). Remaining: WB-031 (seed shipping options + reply-to — general commerce, not wheel; deferred). → WB-031

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

### WB-049 · Resolved config (all secrets) logged to stdout at startup   [BLOCKER]
- status: done
- area: backend/config
- evidence: backend/medusa-config.js:279 (removed)
- problem: an unconditional `console.log(JSON.stringify(medusaConfig, null, 2))` (inherited from the upstream Railway boilerplate) serialized the whole resolved config on every process start — leaking DATABASE_URL (incl. password), JWT_SECRET, COOKIE_SECRET, Stripe apiKey + webhookSecret, SFTP password + privateKey, Meilisearch admin key, Resend/Sendgrid keys, MinIO secret — into Railway deploy/runtime logs. One of the original four NO-GO blockers (2026-06-05 pre-deploy review).
- fix: delete the log statement (do not log resolved config); leave a comment so it is not reintroduced.
- verify: grep for `console.log(JSON.stringify(medusaConfig` returns no matches; backend starts without printing any secret-bearing config to stdout.
- done: 2026-06-20 — removed the statement at medusa-config.js:279, replaced with a do-not-reintroduce comment. No code references its output, so removal is behavior-neutral.
- refs: —

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
- status: done
- area: storefront/home
- evidence: storefront/src/modules/home/data/get-featured.ts + select-featured.ts ; storefront/src/modules/home/components/featured-blocks/index.tsx ; storefront/src/modules/home/components/catalog-wall/index.tsx (renamed from build-gallery)
- problem: Featured Blocks and Build Gallery render hardcoded placeholder images/text; no real content source exists.
- fix: replace with real CMS-driven or Medusa-collection-backed content, or remove sections entirely until content is available.
- verify: Featured Blocks and Build Gallery render real content (or are removed); no hardcoded placeholder images remain.
- done: 2026-06-26 — Featured Blocks now render real products: `getFeaturedProducts` pulls a curated `NEXT_PUBLIC_FEATURED_HANDLES` (CSV) list exact via the Medusa Store API, falling back to top-priced wheels from Meili; pure unit-tested `selectFeatured` (merge/order/dedup/cap); real thumbnail + brand/name/price/diameter/width/bolt-pattern, CTA → real PDP. Build Gallery's fictional "14.2K community posts" mosaic became `catalog-wall` — a real product mosaic from the already-fetched home catalog (real thumbnails, PDP links, honest "LATEST ARRIVALS" copy). All throw-safe (degrade to null/empty); no fabricated content remains. Storefront-only. Subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-26-home-merchandising-real-content-design.md](../done/specs/2026-06-26-home-merchandising-real-content-design.md) ; plan [docs/done/plans/2026-06-26-home-merchandising-real-content.md](../done/plans/2026-06-26-home-merchandising-real-content.md)

### WB-005 · Tires never grouped + never indexed in Meili   [HIGH]
- status: todo
- area: backend/vendor-sync + backend/search
- evidence: backend/src/modules/vendor-sync/adapters/wheelpros-tires/normalize.ts:56 ; backend/src/modules/vendor-sync/pipeline/apply.ts:314-326 ; backend/src/modules/vendor-sync/search/build-search-document.ts:36
- problem: tire records go through the per-SKU one-product-per-row path with no grouping rule; buildSearchDocument returns a non-wheel stub for tires so they are not indexed in Meilisearch for discovery.
- fix: define a tire grouping rule (e.g. Brand + SectionWidth + AspectRatio + RimDiameter) and add a tire transformer branch to buildSearchDocument so tires appear in search.
- verify: after a tire feed apply, tires appear as grouped Medusa products with multiple variants; Meilisearch contains tire documents with product_type = "tire".
- refs: —

### WB-006 · No admin UI for vendor-sync (API/CLI only)   [HIGH]
- status: done
- area: backend/admin
- evidence: backend/src/admin/ (boilerplate)
- problem: vendor-sync management (triggering runs, approving, cancelling, replaying) is only accessible via API or CLI; no Medusa admin widget exists.
- fix: implement a Medusa admin extension widget for vendor-sync (run list, approve/cancel/replay actions, run status display).
- verify: the Medusa admin (/app) shows a vendor-sync section where an admin can trigger a dry-run, view staged diffs, and approve or cancel a run without using the CLI.
- done: 2026-06-28 — Medusa admin route extension `src/admin/routes/vendor-sync/page.tsx` (sidebar "Vendor Sync") over the 8 existing `/admin/vendor-sync/*` routes: run list + status filter, trigger dry-run, status-gated approve/cancel/replay driven by pure jest-tested helpers (`actionsForStatus`/`badgeForStatus`/`isNonTerminal`, new `test:admin` script), confirm prompts on heavy actions, polling while runs are non-terminal, and a detail drawer (counts/errors/failed groups+SKUs, fetches fresh detail on open via `getRun`) with replay-SKU. `purge-products` deliberately NOT exposed (destructive cutover tool). Build-gated (`medusa build`); added `@medusajs/icons`@2.13.6 + `@medusajs/ui`@4.1.6 as direct backend deps so the admin bundler externalizes them (surgical lockfile change — both already resolved transitively via dashboard@2.13.6). Subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md](../done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md) ; plan [docs/done/plans/2026-06-28-wheel-discovery-vendor-ops.md](../done/plans/2026-06-28-wheel-discovery-vendor-ops.md)

### WB-007 · `hub_bore_mm` INTEGER truncates fractional bore on cached reads   [HIGH]
- status: done
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/migrations/Migration20260601111311.ts:13
- problem: hub_bore_mm is stored as INTEGER in the wheel-size cache table; fractional bore values (e.g. 60.1, 67.1) are truncated on insert and returned as wrong integers.
- fix: store the fractional value as a scaled integer (`hub_bore_mm_x100`, ×100) — keeps `model.number()`→integer so there is NO module-snapshot drift (a `numeric`/`float` ALTER would leave model+DB mismatched). Rename + data-preserving migration; the warm cron self-corrects old truncated values. (Chose scaled-int over decimal/float in brainstorming.)
- verify: a wheel-size lookup for a vehicle with a fractional hub bore returns the correct decimal value from the cache; the migration runs without errors.
- done: 2026-06-23 — bore stored as scaled integer `hub_bore_mm_x100` (read /100, write `Math.round(×100)`); `model.number()` kept → no snapshot drift; reverse-fitment bore gate now reads the accurate value. Hand-authored reversible migration `Migration20260623120000` (rename + ×100) applies on next deploy; warm cron self-corrects old approximate values.
- refs: design [spec](../done/specs/2026-06-23-wheel-size-fitment-hardening-design.md) ; plan [plan](../done/plans/2026-06-23-wheel-size-fitment-hardening.md)

### WB-008 · No fitment cache TTL + no warm/refresh cron   [HIGH]
- status: done
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:52-83
- problem: wheel-size lookup results are cached indefinitely; there is no TTL, no staleness check, and no background job to refresh the cache — stale fitment data persists forever.
- fix: add a configurable TTL (default 90d, computed off the existing `fetched_at` — no new column) + a staleness check; serve stale-while-revalidate on read, plus a nightly warm cron that re-fetches stale entries oldest-first, quota-bounded.
- verify: a cache entry older than the TTL is refreshed on next read (or by cron); entries within TTL are served from cache without an API call.
- done: 2026-06-23 — TTL (default 90d, `WHEEL_SIZE_TTL_DAYS`) computed off `fetched_at` via pure `staleness.ts`; `getFitment` serves stale-while-revalidate (cached value now + background `refreshFitment` upsert); nightly warm cron `wheel-size-warm` (`0 3 * * *`) refreshes oldest-stale entries, quota-bounded. Cron activates on next deploy.
- refs: design [spec](../done/specs/2026-06-23-wheel-size-fitment-hardening-design.md) ; plan [plan](../done/plans/2026-06-23-wheel-size-fitment-hardening.md)

### WB-009 · `product.fitment = []` (reverse-fitment "N confirmed models")   [HIGH]
- status: done
- area: storefront/pdp + backend/wheel-size
- evidence: storefront/src/modules/product-detail/data/get-product.ts:95 (mapToDetail default), wired live at :106-110
- problem: the PDP loader hard-returns an empty fitment array; the "N confirmed models" PDP section always shows zero/empty regardless of actual wheel-size data.
- fix: reverse over the local wheel_size_fitment forward-cache — match cached vehicles whose canonical_bolt_patterns intersect the product AND whose hub the wheel bore clears (same hard gates as fits-vehicle.ts); read display identity from the stored raw body (make.name/model.name/trim/start_year-end_year) — no migration. New pure reverse-fitment.ts + service.reverseFitment + GET /store/fitment/by-product, wired into the PDP loader.
- verify: a wheel product whose bolt patterns match cached vehicles shows a non-empty "N confirmed models" list (real Year Make Model [Trim]); a cached vehicle failing the hub-bore gate is excluded.
- done: reverse over the wheel_size_fitment cache — pure reverse-fitment.ts (extractVehicleIdentity + matchedPattern + buildReverseFitment, bolt+bore hard gates), service.reverseFitment, GET /store/fitment/by-product (no API calls/quota), wired into the PDP loader. Identity read from the stored raw (no migration). Verified by unit tests + a live seed→reverse round-trip (Accord 5x114.3; bogus pattern + tiny bore excluded).
- refs: done/specs/2026-06-18-pdp-reverse-fitment-design.md · done/plans/2026-06-18-pdp-reverse-fitment.md

### WB-010 · No startup warning for silently-disabled modules   [HIGH]
- status: done
- area: backend/config
- evidence: backend/src/lib/module-status.ts ; backend/medusa-config.js (log before export default)
- problem: optional modules (Redis, Stripe, Resend, MinIO, Meilisearch, vendor-sync) are conditionally registered; when env vars are missing the module silently does not load with no log output — hard to diagnose in production.
- fix: add a startup log for each optional module indicating whether it is enabled or disabled and which env var controls it.
- verify: starting the backend without optional env vars prints a clear per-module enabled/disabled log line; no module is silently absent without a log.
- done: 2026-06-21 — pure buildModuleStatusReport(env)/formatModuleStatusReport() in backend/src/lib/module-status.ts mirror the medusa-config conditions for all 8 optional modules; medusa-config logs one ENABLED/DISABLED line each with its controlling env var(s). Booleans + var NAMES only — no secret values (WB-049-safe). Verified by module-status.test.ts (4 cases incl. a no-secret-leak assertion).
- refs: done/specs/2026-06-21-deploy-config-hardening-design.md · done/plans/2026-06-21-deploy-config-hardening.md

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
- status: done
- area: backend/vendor-sync/service
- evidence: backend/src/modules/vendor-sync/pipeline/finalize-apply.ts ; backend/src/modules/vendor-sync/pipeline/retry-policy.ts ; backend/src/modules/vendor-sync/pipeline/apply.ts (adopt-by-external_id/SKU) ; backend/src/modules/vendor-sync/service.ts (RunDate short-circuit)
- problem: when some product groups fail during apply, the run still transitions to completed; the next cron cycle sees the same RunDate and short-circuits without retrying the failed parts.
- fix: track per-group failure; mark a run with partial failures as partially-failed (not completed); have the cron re-run failed groups on the next cycle rather than skipping the feed.
- verify: a run with one failed group is not marked completed; the next cron cycle retries the failed group; a fully-successful retry transitions the run to completed.
- done: 2026-06-21 — partial apply now sets `partially_failed` (not `completed`); the RunDate short-circuit (`shouldShortCircuitFeed`) only fires for `completed`/`exhausted`, so the next cron run re-stages + re-diffs + re-applies the failed groups (succeeded groups are hash-skipped by the diff). Bounded by `apply_attempt_count` + `applyMaxAttempts` (default 3) → `exhausted` stops infinite churn. Retry is idempotent: adopt-by-`external_id` (new groups) + adopt-by-SKU (added variants) so no duplicate products/variants. Shared `finalizeApply` fixes run/approveAndApply/replayRun. Migration adds `apply_attempt_count` + `failed_group_keys`. Verified by retry-policy (8) + adopt (4) + finalize-apply (4) unit tests + full backend suite (253 pass / 4 skipped). Live boot-against-DB smoke recommended post-merge.
- refs: done/specs/2026-06-21-vendor-sync-partial-apply-retry-design.md · done/plans/2026-06-21-vendor-sync-partial-apply-retry.md

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
- status: done
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:64
- problem: on a cache miss the wheel-size API call blocks the request synchronously; slow or unavailable wheel-size API stalls fitment-dependent requests.
- fix (chosen: bounded-block, not fully-async): add an `AbortController` timeout (~5s) to the wheel-size client so a slow/down API returns 503 instead of hanging; serve stale entries instantly + refresh in the background. (Fully-async-on-miss rejected — needs a pending contract + queue/worker.)
- verify: a slow/unreachable wheel-size API returns 503 within the timeout instead of hanging the request; stale cache entries serve instantly and refresh in the background.
- done: 2026-06-23 — `AbortController` client timeout (default 5s, `WHEEL_SIZE_TIMEOUT_MS`) → 408 → existing `resolveByModel` outage path → route 503; orphaned-fetch abort rejection swallowed (no unhandled rejection); stale entries refresh in background (non-blocking). Bounded-block design (true miss still blocks, timeout-bounded), not fully-async.
- refs: design [spec](../done/specs/2026-06-23-wheel-size-fitment-hardening-design.md) ; plan [plan](../done/plans/2026-06-23-wheel-size-fitment-hardening.md)

### WB-020 · Quota counter non-atomic read-modify-write   [MEDIUM]
- status: done
- area: backend/wheel-size
- evidence: backend/src/modules/wheel-size/service.ts:38-46
- problem: the API quota counter is implemented as a read-then-write in application code; concurrent requests can race and exceed the quota limit.
- fix: use a database-level atomic increment (UPDATE ... SET count = count + 1 RETURNING count) or a Redis counter for the quota check.
- verify: under simulated concurrency, the quota counter does not exceed the configured limit; no over-counting race is possible.
- done: 2026-06-23 — single atomic upsert-increment (`INSERT … ON CONFLICT ("day") WHERE deleted_at IS NULL DO UPDATE SET count = count + 1 RETURNING count`) via the module's knex connection, parameterized bindings, fail-closed on empty rows. Accessor + partial-index `ON CONFLICT` runtime-verified against the live DB.
- refs: design [spec](../done/specs/2026-06-23-wheel-size-fitment-hardening-design.md) ; plan [plan](../done/plans/2026-06-23-wheel-size-fitment-hardening.md)

### WB-021 · Discovery + home Meili queries uncached (no TTL/revalidate)   [MEDIUM]
- status: done
- area: storefront/discovery + storefront/home
- evidence: storefront/src/modules/discovery/data/get-products.ts:137-202 ; storefront/src/modules/home/data/get-home-catalog.ts:22
- problem: every discovery page load and home page load issues live Meilisearch queries with no caching; high traffic will hammer Meilisearch unnecessarily.
- fix: add Next.js fetch cache / revalidate options (or unstable_cache) to the Meilisearch query functions so results are cached with a reasonable TTL (e.g. 60s).
- verify: repeated discovery/home requests within the TTL do not re-query Meilisearch; a cache hit is observable (e.g. via Meilisearch query logs or Next.js cache headers).
- done: 2026-06-28 — `getDiscoveryProducts` wrapped in Next `unstable_cache` (60s revalidate, tag `discovery`) keyed by a pure, order-independent `discoveryCacheKey(query)`. The inner `fetchDiscoveryProducts` THROWS on Meili failure so the `try/catch → emptyResult` sits OUTSIDE the cache — empties are never cached and self-heal on the next request once Meili recovers; a future re-sync can `revalidateTag("discovery")`. 60s listing staleness is acceptable because the PDP reads live. `getHomeCatalog`'s existing `react.cache()` layers per-request dedup on top. 5 vitest cases on the key. Subagent-driven.
- refs: design [docs/done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md](../done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md) ; plan [docs/done/plans/2026-06-28-wheel-discovery-vendor-ops.md](../done/plans/2026-06-28-wheel-discovery-vendor-ops.md)

### WB-022 · Guest→login garage merge = N best-effort client POSTs   [MEDIUM]
- status: done
- area: storefront/garage + backend/customer-vehicle
- evidence: backend/src/api/store/customer/vehicles/merge/route.ts ; backend/src/modules/customer-vehicle/service.ts (`mergeForCustomer`) ; storefront/src/lib/garage/medusa-garage.ts (`mergeFrom`) ; storefront/src/lib/garage/index.ts (`mergeLocalIntoRemote` clear-on-success) ; storefront/src/lib/garage/merge.ts (`planMerge` returns Vehicle[])
- problem: when a guest logs in, the garage merge sends N individual POST requests from the client for each local vehicle; any failure silently drops vehicles and the merge is not atomic.
- fix: implement a server-side merge endpoint that accepts the full local garage state and merges it atomically, or use a Medusa workflow to ensure all-or-nothing persistence.
- verify: a guest with 3 local vehicles who logs in ends up with all 3 vehicles in their authed garage; a network failure during merge is retried or clearly surfaced.
- done: 2026-06-26 — replaced the N fire-and-forget POSTs with ONE idempotent request: `CustomerVehicleService.mergeForCustomer` loops the existing idempotent `createForCustomer` behind a public `POST /store/customer/vehicles/merge` (auth'd, returns only the caller's list). Storefront `MedusaGarage.mergeFrom` sends the batch and adopts the result; `RoutingGarage.mergeLocalIntoRemote` clears the local garage ONLY on success (failure keeps local + retries on the next auth sync). **Final-review fix:** `planMerge`/`vehiclesToMerge` now return full `Vehicle[]` so the guest vehicle's STABLE local id flows through as the `client_id` — making the merge idempotent across PARTIAL-write retries (a re-sent already-persisted row hits the `(customer_id, client_id)` guard instead of duplicating). Pure `planMerge` + backend `mergeForCustomer` unit-tested (storefront 102 / backend customer-vehicle 9). Subagent-driven (opus final review). Live merge smoke DEFERRED → pre-deploy.
- refs: design [docs/done/specs/2026-06-26-account-garage-design.md](../done/specs/2026-06-26-account-garage-design.md) ; plan [docs/done/plans/2026-06-26-account-garage.md](../done/plans/2026-06-26-account-garage.md)
- refs: —

### WB-023 · Newsletter signup is a fake `setTimeout`, nothing persisted   [MEDIUM]
- status: done
- area: storefront/home + backend/newsletter
- evidence: backend/src/modules/newsletter/ (module) ; backend/src/api/store/newsletter/route.ts ; storefront/src/lib/data/newsletter.ts ; storefront/src/modules/home/actions.ts ; storefront/src/modules/home/components/newsletter/index.tsx
- problem: the newsletter signup handler uses a setTimeout to fake a loading state; no email is captured, no API is called, nothing is persisted.
- fix: wire the newsletter signup to a real email-capture backend (Resend audience, Sendgrid list, or a Medusa custom table); remove the fake setTimeout.
- verify: submitting the newsletter form stores the email address in a persistent store; the email is retrievable after a server restart.
- done: 2026-06-26 — chosen approach: a new Medusa `newsletter` module (mirrors `customer-vehicle`) with a `newsletter_subscription` table (unique email index, partial on `deleted_at IS NULL`) + idempotent `subscribe(email, meta)` + pure jest-tested `normalizeEmail`/`isValidEmail`. Public `POST /store/newsletter` validates → subscribes → always `201 { subscribed: true }` (created OR existing, so membership isn't leaked). Storefront: `lib/data/newsletter.ts` (sdk.client.fetch) + `home/actions.ts` server action replaces the fake setTimeout, with success/error toasts. Hand-authored migration `Migration20260626120000` applies on deploy. Subagent-driven (final opus review: ready to merge). Newsletter hardening (unsubscribe/rate-limit/double-opt-in) deferred → [[WB-057]]. Live POST-persists+idempotent smoke DEFERRED → pre-deploy.
- refs: design [docs/done/specs/2026-06-26-home-merchandising-real-content-design.md](../done/specs/2026-06-26-home-merchandising-real-content-design.md) ; plan [docs/done/plans/2026-06-26-home-merchandising-real-content.md](../done/plans/2026-06-26-home-merchandising-real-content.md)

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
- status: done
- area: backend/config
- evidence: backend/src/lib/dev-max-rows.ts ; backend/medusa-config.js (devMaxRows assignment)
- problem: devMaxRows feed truncation is active whenever NODE_ENV !== 'production'; a staging environment running with NODE_ENV=staging silently gets truncated feeds and reduced catalog.
- fix: key devMaxRows off a dedicated env var (e.g. DEV_MAX_ROWS) rather than NODE_ENV so staging environments can run full feeds explicitly.
- verify: a server running NODE_ENV=staging with DEV_MAX_ROWS unset processes the full feed; devMaxRows only truncates when DEV_MAX_ROWS is explicitly set.
- done: 2026-06-21 — resolveDevMaxRows(raw) in backend/src/lib/dev-max-rows.ts; truncation is explicit opt-in (active only when VENDOR_SYNC_DEV_MAX_ROWS parses to a positive int), no NODE_ENV coupling. .env.template ships VENDOR_SYNC_DEV_MAX_ROWS=1000 so local dev keeps fast first-imports. Verified by dev-max-rows.test.ts (4 cases).
- refs: done/specs/2026-06-21-deploy-config-hardening-design.md · done/plans/2026-06-21-deploy-config-hardening.md

### WB-028 · Storefront merchandising/policy copy hardcoded   [MEDIUM]
- status: done
- area: storefront/home + storefront/pdp
- evidence: storefront/src/modules/home/data/merchandising.ts ; storefront/src/modules/home/components/trust-strip/index.tsx ; storefront/src/modules/home/components/hero/index.tsx ; storefront/src/app/[countryCode]/(main)/page.tsx (generateMetadata)
- problem: merchandising copy (trust strips, hero step labels, shop-by-style category map, page title brand count) is hardcoded in component files; changing copy requires code changes.
- fix: move merchandising copy to a config object, CMS, or environment variable so it can be updated without code changes.
- verify: changing a trust-strip message or hero label in config (not component source) updates the rendered storefront without a code deploy.
- done: 2026-06-26 — trust-strip items + hero eyebrow/headline/subcopy/trust-points extracted to `home/data/merchandising.ts` (`TRUST_STRIP_ITEMS`, `HERO_COPY`); components import them and keep ONLY the brand-count-dependent values computed. The home page `metadata` became `generateMetadata()` reading the live brand count from `getHomeCatalog()` (react.cache'd → free), removing the fabricated "40+". `STYLE_DEFS` (shop-by-style) was already an isolated config array with its own test → left as-is. PDP placeholder copy was already de-hardcoded in WB-029 (`pdp-config.ts`). Subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-26-home-merchandising-real-content-design.md](../done/specs/2026-06-26-home-merchandising-real-content-design.md) ; plan [docs/done/plans/2026-06-26-home-merchandising-real-content.md](../done/plans/2026-06-26-home-merchandising-real-content.md)

### WB-029 · PDP placeholders (qty default, construction/origin/warranty, low-stock threshold, ship copy)   [MEDIUM]
- status: done
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/data/pdp-config.ts ; storefront/src/modules/product-detail/data/group-sizes.ts (`availabilityOf(qty, threshold)`) ; storefront/src/modules/product-detail/components/specs/index.tsx (null-row guards)
- problem: PDP displays hardcoded placeholder values: quantity defaults to 4, construction/origin/warranty fields show "—", low-stock threshold is hardcoded at ≤4, shipping copy is placeholder text.
- fix: source qty default and low-stock threshold from config; populate construction/origin/warranty from product metadata (vendor feed or admin); replace ship copy with real content.
- verify: a product with construction metadata in its Medusa record shows that value on the PDP instead of "—"; qty default and low-stock threshold come from config.
- done: 2026-06-25 — new `pdp-config.ts` (env-overridable `DEFAULT_WHEEL_QTY`, `LOW_STOCK_THRESHOLD`, `FREE_SHIP_THRESHOLD_USD`, `SHIP_LEAD_TIME`, `TRUST_STRIP`; `intEnv` truncates + falls back safely); `availabilityOf` threshold now config-driven (default-4 behavior unchanged). Construction/origin/warranty: the wheel feed has NO source for these — so the specs grid reads admin-set product metadata if present, else HIDES the row (no fabricated "—"). Built subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-25-pdp-correctness-polish-design.md](../done/specs/2026-06-25-pdp-correctness-polish-design.md) ; plan [docs/done/plans/2026-06-25-pdp-correctness-polish.md](../done/plans/2026-06-25-pdp-correctness-polish.md)

### WB-030 · `normalizeFinish` hand-synced twin across apps   [MEDIUM]
- status: done
- area: backend/vendor-sync/search + storefront/pdp
- evidence: fixtures/finish-normalize-golden.json ; backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts ; storefront/src/lib/fitment/normalize-finish.ts + storefront/src/lib/fitment/__tests__/normalize-finish.test.ts
- problem: normalizeFinish is duplicated verbatim between the backend search transformer and the storefront PDP loader; the two copies must be kept in lockstep manually — any divergence silently mismatches finish labels between discovery and PDP.
- fix: extract normalizeFinish into a shared package or a backend API response field so there is a single source of truth; the storefront reads the normalized value rather than re-computing it.
- verify: changing the normalizeFinish logic in one place propagates to both discovery and PDP; there is no second copy to update.
- done: 2026-06-25 — chosen approach: golden-fixture lockstep (mirrors the existing `bolt-pattern-canonical-golden.json` precedent; the single-stored-value alternative was rejected to avoid a catalog backfill right after the WB-051 re-import). The storefront's inline copy is extracted to `@lib/fitment/normalize-finish.ts`; a shared `fixtures/finish-normalize-golden.json` (22 vectors incl. precedence-collision cases) is asserted by a test in EACH app, so a future edit that breaks keyword precedence in either copy fails CI instead of silently shipping. Two implementations remain (backend keyword-arrays, storefront regex) but cannot drift. Built subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-25-pdp-correctness-polish-design.md](../done/specs/2026-06-25-pdp-correctness-polish-design.md) ; plan [docs/done/plans/2026-06-25-pdp-correctness-polish.md](../done/plans/2026-06-25-pdp-correctness-polish.md)

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
- status: done
- area: storefront/account
- evidence: storefront/src/app/[countryCode]/(main)/account/@dashboard/garage/page.tsx ; storefront/src/modules/account/components/garage/index.tsx ; storefront/src/modules/account/components/account-nav/index.tsx (Garage link) ; storefront/src/modules/common/icons/car.tsx
- problem: the account navigation has no Garage entry; there is no /account/garage route where a logged-in user can view or manage their saved vehicles.
- fix: add a Garage tab to the account nav and implement /account/garage as a route that renders the authed garage component.
- verify: a logged-in user can navigate to /account/garage and see their saved vehicles; the Garage tab appears in the account sidebar.
- done: 2026-06-26 — new auth-guarded `@dashboard/garage/page.tsx` parallel route renders `GarageManager` (a client component over the existing `useGarage()` hook, in legacy account Medusa-UI styling): lists saved vehicles, set-active, remove, empty state; "Add a vehicle" reuses the YMM search drawer (`openSearch`) — the one canonical add flow that also runs the wheel-size fitment lookup. A "Garage" link (new Car icon) was added to the account nav (desktop + mobile) between Addresses and Orders. Subagent-driven (opus final review: ready to merge). Live nav/route smoke DEFERRED → pre-deploy.
- refs: design [docs/done/specs/2026-06-26-account-garage-design.md](../done/specs/2026-06-26-account-garage-design.md) ; plan [docs/done/plans/2026-06-26-account-garage.md](../done/plans/2026-06-26-account-garage.md)

### WB-033 · Direct nav to `/checkout` stalls (no default `?step=`)   [MEDIUM]
- status: done
- area: storefront/checkout
- evidence: storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx (awaits searchParams; redirect when no step)
- problem: navigating directly to /checkout without a ?step= query param causes the checkout page to stall or render in an indeterminate state rather than redirecting to the first step.
- fix: add a redirect from /checkout (no step param) to /checkout?step=address (or the appropriate first step) so direct navigation works correctly.
- verify: navigating to /<countryCode>/checkout without ?step= redirects to the address step and renders the checkout form correctly.
- done: 2026-06-26 — the checkout RSC now awaits Next-15 `params`/`searchParams` and `redirect()`s to `?step=address` (before any cart fetch) when `step` is absent; the four client step components are unchanged. Always lands on address (first-incomplete-step computation deliberately out of scope). Live smoke deferred to pre-deploy.
- refs: design [docs/done/specs/2026-06-26-checkout-cart-transactable-design.md](../done/specs/2026-06-26-checkout-cart-transactable-design.md) ; plan [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

### WB-034 · Cart qty capped at hardcoded 10, ignores live stock   [MEDIUM]
- status: done
- area: storefront/cart
- evidence: storefront/src/modules/cart/components/item/max-qty.ts ; storefront/src/modules/cart/components/item/index.tsx (uses maxSelectableQty)
- problem: the cart item quantity selector is capped at 10 regardless of actual inventory; a product with 2 in stock allows qty 10; a product with 50 in stock caps at 10.
- fix: fetch live inventory quantity for each cart item variant and use it as the max qty; fall back to a configurable cap if inventory is unavailable.
- verify: the cart qty selector cap matches the actual inventory level for the variant; a variant with 3 in stock caps at 3, not 10.
- done: 2026-06-26 — pure `maxSelectableQty(variant, currentQty)` caps at live `inventory_quantity` when the variant manages stock AND disallows backorder, else a FALLBACK_MAX (10); never returns below the qty already in cart (a post-add stock drop can't make the current selection unpickable). Cart page already enriches `inventory_quantity`. Unit-tested (6 boundary cases).
- refs: design [docs/done/specs/2026-06-26-checkout-cart-transactable-design.md](../done/specs/2026-06-26-checkout-cart-transactable-design.md) ; plan [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

### WB-035 · Express Pay / Affirm are non-functional chrome   [MEDIUM]
- status: done
- area: storefront/checkout
- evidence: storefront/src/modules/checkout/components/express-pay/config.ts ; checkout-form/index.tsx (gated mount) ; checkout-summary/index.tsx (gated Affirm)
- problem: Express Pay and Affirm buttons are rendered as UI chrome with no real payment provider integration; clicking them does nothing or shows a stub.
- fix: either integrate real Express Pay (Stripe Link, Apple Pay, Google Pay) and Affirm providers, or remove the buttons until providers are available.
- verify: Express Pay and Affirm buttons either complete a real payment flow, or are entirely absent from the UI (no non-functional chrome).
- done: 2026-06-26 — env-gated (chosen over hard-remove to preserve the built UI + seam). `isExpressPayEnabled()`/`isAffirmEnabled()` read two default-OFF flags (`NEXT_PUBLIC_EXPRESS_PAY_ENABLED`/`NEXT_PUBLIC_AFFIRM_ENABLED`); the ExpressPay mount + the Affirm line (still `&& total > 0`) render only when on. Hidden by default → no misleading chrome. Deliberately NOT gated on the Stripe key (so enabling Stripe CARD payments won't surface non-functional WALLET buttons). **Flags are `NEXT_PUBLIC_*` → changing them needs a storefront REBUILD.** Real wallet/Affirm wiring is still future work.
- refs: design [docs/done/specs/2026-06-26-checkout-cart-transactable-design.md](../done/specs/2026-06-26-checkout-cart-transactable-design.md) ; plan [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

### WB-036 · Gift card / discount-remove stubbed or buggy   [MEDIUM]
- status: done
- area: storefront/cart + storefront/checkout
- evidence: storefront/src/modules/checkout/components/discount-code/promo-codes.ts ; discount-code/index.tsx (rewired) ; storefront/src/lib/data/cart.ts (dead stubs removed)
- problem: gift card redemption and discount code removal are either stubbed out or have bugs; the discount-code UI component does not correctly remove applied codes.
- fix: implement working gift card apply/remove and discount code remove using the Medusa cart API; test the full apply→remove flow.
- verify: applying and then removing a discount code from the cart correctly removes the discount; gift card redemption applies the credit to the order total.
- done: 2026-06-26 — discount fixed: the remove/add filter was inverted (`p.code === undefined`), so removing one code wiped ALL (and adding dropped existing). Pure `retainedPromoCodes(promotions, removeCode?)` keeps the OTHER manual codes (`!is_automatic && code != null`, matching the UI's remove gate); both call sites rewired. Unit-tested (5 cases). The three dead commented-out gift-card no-op stubs (`applyGiftCard`/`removeGiftCard`/`removeDiscount`, v1 shape, zero importers) were deleted. **Gift cards deferred** — real Medusa-v2 gift-card support is [[WB-054]].
- refs: design [docs/done/specs/2026-06-26-checkout-cart-transactable-design.md](../done/specs/2026-06-26-checkout-cart-transactable-design.md) ; plan [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

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
- status: done
- area: backend/config
- evidence: backend/src/lib/cors.ts ; backend/src/lib/constants.ts (ADMIN/AUTH/STORE_CORS exports)
- problem: if BACKEND_CORS env var is unset, the CORS allowed-origins list is undefined; this may silently allow all origins or reject all origins depending on Medusa's fallback behavior.
- fix: add a safe default (e.g. localhost origins for dev, fail-loudly if unset in production) so CORS behavior is always explicit.
- verify: starting the backend without BACKEND_CORS set either logs a clear warning with the applied default or fails with an actionable error; CORS does not silently allow all origins in production.
- done: 2026-06-21 — resolveCors(value, {isProduction, devDefault, name}) in backend/src/lib/cors.ts; ADMIN/AUTH/STORE_CORS now resolve through it. Unset in production throws an actionable startup error (consistent with assertValue + WB-041 fail-loud); non-prod falls back to a localhost default + a console.warn. .env.template notes CORS is required in prod. Verified by cors.test.ts (4 cases).
- refs: done/specs/2026-06-21-deploy-config-hardening-design.md · done/plans/2026-06-21-deploy-config-hardening.md

### WB-040 · No committed deploy config (railway.json/Dockerfile/Procfile)   [MEDIUM]
- status: done
- area: backend/infra + storefront/infra
- evidence: backend/railway.json ; storefront/railway.json
- problem: there is no committed railway.json, Dockerfile, or Procfile; Railway deployment configuration lives only in the Railway dashboard and is not reproducible from the repo.
- fix: commit railway.json (or Dockerfile/Procfile) for both backend and storefront services so deployment config is version-controlled and reproducible.
- verify: a fresh Railway project can be configured entirely from the committed deploy config without manual dashboard steps.
- done: 2026-06-21 — per-app railway.json (Nixpacks builder, `pnpm start`, ON_FAILURE restart policy; backend adds healthcheckPath /health, storefront omits it because Next / 307-redirects through the country-code middleware). Assumes each Railway service root = its app dir (backend/, storefront/). Scope is dashboard-independent settings only — no env vars / service wiring encoded. Both files validated as JSON.
- refs: done/specs/2026-06-21-deploy-config-hardening-design.md · done/plans/2026-06-21-deploy-config-hardening.md

### WB-041 · SFTP has no fail-loud guard → silently syncs sample CSV if env unset   [MEDIUM]
- status: done
- area: backend/vendor-sync/feed-source
- evidence: backend/src/modules/vendor-sync/feed-source/resolve-feed.ts (resolveFeed guard + SampleFeedNotAllowedError)
- problem: if SFTP env vars are unset, the feed resolver falls back to the local sample CSV silently; a production server with misconfigured SFTP env vars will silently sync stale sample data.
- fix: fail-loud guard in resolveFeed — require a live feed (SFTP or a non-sample feedPath); permit the bundled sample only when VENDOR_ALLOW_SAMPLE_FEED=true, else throw SampleFeedNotAllowedError (no NODE_ENV coupling). A feedPath pointing at a bundled sample CSV is gated too.
- verify: starting vendor-sync in production mode without SFTP env vars throws an error or logs a prominent warning rather than silently falling back to sample data.
- done: 2026-06-20 — single guard in resolveFeed covers both adapters at the shared chokepoint; flag plumbed as a module option (medusa-config → run() → resolveFeed arg, no process.env in the resolver); a thrown guard is caught by run()'s existing try/catch → status:failed with an actionable message (in-progress guard released, no stuck run). dry-run opts into the sample + prints error_message; a prominent WARN fires whenever the sample is in use. No migration. Verified by resolve-feed.test.ts (8 cases) + a 2-reviewer adversarial pass (both "ship", traced the throw→failed path); backend vendor-sync suite 183 pass. Live boot-against-DB smoke recommended post-merge.
- refs: done/specs/2026-06-20-vendor-sync-fail-loud-feed-guard-design.md · done/plans/2026-06-20-vendor-sync-fail-loud-feed-guard.md

---

## Deferred (Plan 4+, from master roadmap — still valid)

### WB-042 · Durable feed archiving to object storage — merged into WB-017. See WB-017.

### WB-043 · wheel-size live-slug verification (no test proves dropdown slugs resolve)   [LOW]
- status: done
- area: backend/wheel-size + storefront/fitment
- evidence: backend/src/modules/wheel-size/service.ts:52-83
- problem: there is no test that proves the YMM dropdown slug values used in the storefront resolve correctly against the live wheel-size `by_model` API endpoint; slug format could be wrong without detection.
- fix: add an integration test (or a manual verification doc) that confirms at least one make/model/year slug round-trips through the live API and returns fitment data.
- verify: a test or documented manual step confirms that a real YMM slug fetched from the dropdown resolves to wheel fitment data from wheel-size.com `by_model`.
- done: 2026-06-23 — gated `__tests__/live-slug.test.ts` (`describe.skip` unless `RUN_WHEEL_SIZE_LIVE=true` + `WHEEL_SIZE_API_KEY`) asserts a real honda/accord/2021 `by_model` resolves to 200 with numeric `stud_holes`+`pcd`. Offline by default. Run: `RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=<key> pnpm test:fitment -- live-slug`.
- refs: design [spec](../done/specs/2026-06-23-wheel-size-fitment-hardening-design.md) ; plan [plan](../done/plans/2026-06-23-wheel-size-fitment-hardening.md)

### WB-044 · Rename `teraflex` test fixtures/handles   [LOW]
- status: done
- area: backend/vendor-sync/tests
- evidence: backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts:5,44 ; backend/src/modules/vendor-sync/__fixtures__/*.csv
- problem: test fixtures and handles still use the old `teraflex` name (pre-rename to wheelpros); they are functionally correct but misleading and inconsistent with the live codebase naming.
- fix: rename teraflex fixture files and update all handle references in the test file to wheelpros equivalents.
- verify: grep for "teraflex" in backend/src/modules/vendor-sync/__tests__/ and __fixtures__/ returns no matches; all tests still pass after rename.
- done: 2026-06-28 — renamed `Teraflex` (a real Jeep-suspension brand that does NOT make wheels → misleading wheel fixture) to `Petrol` (a genuine wheel brand) across 4 test files + 2 CSV fixtures, with handles/group-keys/assertions moved in lockstep (no weakened assertions). Repo-wide grep `teraflex` in backend = 0; full vendor-sync suite green (caught the `hash.test.ts` makeTireRecord sibling). Subagent-driven.
- refs: design [docs/done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md](../done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md) ; plan [docs/done/plans/2026-06-28-wheel-discovery-vendor-ops.md](../done/plans/2026-06-28-wheel-discovery-vendor-ops.md)

### WB-045 · License-plate lookup is a disabled stub   [LOW]
- status: done
- area: storefront/fitment
- evidence: storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx (stub removed)
- problem: the license-plate lookup tab in the YMM pane is rendered but disabled/stubbed; no real lookup provider is wired up.
- fix: either integrate a license-plate-to-YMM lookup API (NHTSA or similar) or remove the tab until a provider is chosen.
- verify: the license-plate lookup either returns a real vehicle match for a valid plate+state, or the tab is entirely absent from the UI (no disabled stub).
- done: 2026-06-26 — chose REMOVE (honest, no non-functional "coming soon" chrome; same stance as WB-035's hidden express-pay buttons). Deleted the disabled "SEARCH BY LICENSE PLATE →" `<Label>` block (+ its now-unused `Label` import) from `ymm-pane.tsx`; grep storefront-wide for "SEARCH BY LICENSE PLATE" is clean. A real plate→YMM provider needs a paid commercial API + state → deferred to [[WB-058]].
- refs: split out of G7 (2026-06-26)

### WB-046 · Category facet is dead in discovery (no backend source)   [LOW]
- status: done
- area: storefront/discovery + backend/search
- evidence: storefront/src/modules/discovery/data/get-products.ts:117,184
- problem: the category facet is listed in FACET_FIELDS and rendered in the discovery UI, but no category data is written to the Meilisearch index by the vendor-sync transformer; the facet always returns empty.
- fix: populate a category field in the Meilisearch wheel document from the vendor feed data (e.g. product category or type) and wire it to the category facet.
- verify: the category facet in discovery shows real options sourced from indexed wheel documents; filtering by category returns matching products.
- done: 2026-06-28 — chose REMOVE over wire-up: no category source exists anywhere (feed → transformer → index all lack it), so the facet was permanently empty (`facets.categories` hardcoded `{}`). Same no-fabricated-content stance as WB-029. Stripped `categories` from `DiscoveryFilters`/`FacetCounts`/`DiscoveryProduct`/`EMPTY_FILTERS`/`parseQueryFromSearchParams`, the empty facet, and the filter-rail accordion + `CATEGORY_LABELS`; swept every consumer (active-chips, mobile-trigger, use-discovery-query) + the `DiscoveryProduct.categories` type-ripple into get-product/get-featured/style-map fixtures (grep `categories` in modules/discovery = 0). Home `STYLE_DEFS` (shop-by-style) is a separate predefined-query mechanism — untouched. A real wheel-style classifier to revive the facet would be a much larger separate piece → future backlog. Subagent-driven.
- refs: design [docs/done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md](../done/specs/2026-06-28-wheel-discovery-vendor-ops-design.md) ; plan [docs/done/plans/2026-06-28-wheel-discovery-vendor-ops.md](../done/plans/2026-06-28-wheel-discovery-vendor-ops.md)

---

## Low (doc/cosmetic)

### WB-047 · Stale "Medusa Store" / "test order" copy   [LOW]
- status: done
- area: storefront/order + storefront/checkout
- evidence: storefront/src/modules/checkout/components/review/index.tsx (brand copy) ; storefront/src/modules/order/templates/order-completed-template.tsx (onboarding CTA removed)
- problem: order confirmation and checkout review components still show Medusa boilerplate copy ("Medusa Store", "test order", etc.) instead of Wheel Builds branded text.
- fix: replace all Medusa boilerplate copy with Wheel Builds branded equivalents in the affected components.
- verify: grep for "Medusa Store" and "test order" in storefront/src/modules/order/ and storefront/src/modules/checkout/ returns no matches; components show WB-branded copy.
- done: 2026-06-26 — review copy → "Wheel Builds' Privacy Policy"; the dead `_medusa_onboarding`-cookie-gated "test order" onboarding CTA was removed and its orphaned component deleted (also cleared a pre-existing unawaited-`cookies()` tsc error). `modules/order` + `modules/checkout` are now clean of "Medusa Store"/"test order". Remaining "Medusa Store" copy in OTHER modules (account/register, collections/categories metadata, side-menu © footer) was out of this item's scope → [[WB-055]].
- refs: design [docs/done/specs/2026-06-26-checkout-cart-transactable-design.md](../done/specs/2026-06-26-checkout-cart-transactable-design.md) ; plan [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

### WB-048 · Placeholder bolt pattern ("BLANK"/empty) is a selectable PDP gate   [MEDIUM]
- status: done
- area: storefront/pdp + backend/vendor-sync
- evidence: storefront/src/modules/product-detail/data/group-sizes.ts (`isRealBoltPattern` + placeholder size-keying) ; storefront/src/modules/product-detail/data/get-product.ts (`.filter(isRealBoltPattern)`) ; storefront/src/modules/product-detail/components/hero/variant-picker.tsx (row hidden when ≤1 pattern)
- problem: some vendor rows carry `bolt_pattern_raw = "BLANK"` (or empty) as a placeholder. Since WB-003 made the bolt-pattern row load-bearing (it now gates the size grid), a literal "BLANK" value becomes its own group key, a selectable chip, and a filter target — e.g. `performance-replicas-126-gloss-black` exposes a clickable "BLANK" pattern. Pre-existing data quality, but now user-visible and functional.
- fix: drop/normalize placeholder bolt patterns at the loader (`boltPatternOptions` in get-product.ts) so "BLANK"/"" never becomes a clickable gate; keep `sizesForBoltPattern`'s all-sizes fallback as the safety net for genuinely pattern-less products. Optionally normalize "BLANK" upstream in vendor-sync.
- verify: a product whose variants include a "BLANK"/empty bolt_pattern_raw shows no "BLANK" chip in the PDP variant picker; its sizes still render (via fallback).
- done: 2026-06-25 — pure `isRealBoltPattern(raw)` rejects ""/whitespace/"BLANK"/"N/A"; loader filters `boltPatterns` through it (transitively cleans `boltPatternOptions` + `boltPatternsCanonical` + lead `boltPattern`); placeholder variants keyed `""` so they surface ONLY via the all-sizes fallback; variant-picker hides the bolt-pattern row when ≤1 real pattern. Unit-tested (isRealBoltPattern + placeholder-keying roundtrip). Live-backend BLANK-chip smoke deferred to pre-deploy. Built subagent-driven (final opus review: ready to merge).
- refs: design [docs/done/specs/2026-06-25-pdp-correctness-polish-design.md](../done/specs/2026-06-25-pdp-correctness-polish-design.md) ; plan [docs/done/plans/2026-06-25-pdp-correctness-polish.md](../done/plans/2026-06-25-pdp-correctness-polish.md) (discovered during WB-003)

---

## Deploy build

### WB-050 · `medusa build` fails on pre-existing TypeScript errors (every deploy broken)   [BLOCKER]
- status: done
- area: backend (api routes + wheel-size + vendor-sync) + infra
- evidence: backend/src/api/store/{fitment,vehicle-catalog,customer}/**/route.ts ; backend/src/modules/wheel-size/service.ts ; backend/src/modules/vendor-sync/pipeline/{bootstrap,stage}.ts
- problem: `medusa build` runs a tsc typecheck and exits 1 on type errors (unlike the storefront, which sets `typescript.ignoreBuildErrors`). 16 pre-existing type errors (svc resolved as `unknown` in the fitment/vehicle-catalog/customer routes; `model.json()` columns vs typed shapes in wheel-size; metadata-filter + Object.entries inference in vendor-sync) failed every Railway deploy. Confirmed pre-existing via A/B against pre-Session-1 commit 786ac54 (fails identically). Surfaced from a Railpack deploy log; the Nixpacks builder failed even earlier at config-load (`null.admin`).
- fix: type the 16 sites properly — `resolveOptional<WheelSizeService>` at the 6 wheel-size routes; `in`-narrowing for the customer/vehicles parse result; typed boundary reads/writes for wheel-size `model.json()` columns; typed stock entries + metadata-filter cast in vendor-sync. Switch `railway.json` builder NIXPACKS→RAILPACK (Railpack loads the config; Nixpacks did not).
- verify: `cd backend && npx tsc --noEmit` returns 0 errors; full backend suite green (253 pass / 4 skipped); a Railway deploy compiles the backend without errors.
- done: 2026-06-21 — all 16 errors resolved (tsc clean, no behavior change — type-only edits + one route control-flow restructure); railway.json switched to Railpack for both apps. Live Railway deploy still to be re-run by the user to confirm a green build end-to-end.
- refs: —

---

## Catalog completeness

### WB-051 · Wheel grouping fails ~300 groups on center-bore axis collisions (4-axis variant key)   [HIGH]
- status: done
- area: backend/vendor-sync/pipeline
- evidence: backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts (`variantAxisKey` 6-axis, `formatOptionalAxis`, `axisKeyFromMetadata`, `findExactDuplicates`, `dedupeExactDuplicates`, `dedupeAddedAgainstExisting`) ; apply.ts (`applyNewWheelGroup` + changed-group add path dedupe, no throw) ; storefront group-sizes.ts (`boresFor`/`loadsForBore`/`resolveLeafVariant`) + hero `spec-selector.tsx`
- problem: variants inside a wheel product are keyed by a 4-axis tuple — bolt pattern × diameter × width × offset (`variantAxisKey`). When two SKUs in the same Brand+DisplayStyleNo+Finish group share all four but differ on **center bore** (e.g. XD845: same `8X6.5|22|8.25|105`, different `centerBoreMm`), they map to the same variant cell. `findAxisCollision` detects this and `applyNewWheelGroup` THROWS — failing the WHOLE group rather than silently merging two physically-different wheels into one variant (deliberate fail-loud-don't-corrupt). On the 2026-06-23 production import this failed **~300 groups (~12.8k of ~33k variants)** — large groups, so a big slice of the catalog is missing.
- fix: (a) **dedupe true duplicates** — a collision with NO hidden distinction (identical centerBoreMm + loadRatingLb) is the same wheel listed twice; keep one. (b) **add center bore as a 5th variant axis** (and/or load rating) so genuinely-distinct wheels become separate variants instead of failing. Thread the new axis through `variantAxisKey`, `buildProductOptions`, `buildVariantOptions`, the Meili transformer, and the PDP variant grid.
- verify: a product whose SKUs differ only by center bore imports as ONE product carrying both variants (distinct center-bore options) with no axis-collision failure; re-running the feed applies the previously-failing ~300 groups (apply `errors` drops to ~0).
- done: 2026-06-23 — 6-axis variant model (center bore + load rating); apply dedupes exact duplicates instead of throwing (new-group AND changed-group add paths); PDP progressive-disclosure bore/load selectors with load cascading off bore. Full prod wipe + re-import: **groups=2670 variants=29435 errors=0** (16,092 stock levels applied) — the previously-failing ~300 collision groups now import; catalog was ~2,383 groups, now 2,670. Migrated via the new `purge-products` admin route + `vendor-sync-truncate-state.ts` (dev-wipe's ORM bulk-delete overflows knex on prod-scale state tables: 372k stock-staging rows). Merged to `main` (10 feature commits + 2 ops tools); reviewed per-task + final opus whole-branch review.
- refs: design [docs/done/specs/2026-06-23-wheel-axis-collision-design.md](../done/specs/2026-06-23-wheel-axis-collision-design.md) ; plan [docs/done/plans/2026-06-23-wheel-axis-collision.md](../done/plans/2026-06-23-wheel-axis-collision.md)

---

### WB-052 · `vendor-sync-dev-wipe` doesn't scale to production-size state tables   [LOW]
- status: done
- area: backend/vendor-sync/scripts
- evidence: backend/src/scripts/vendor-sync-dev-wipe.ts (collects every id into one `delete(ids)` → `WHERE id IN (...)`) ; superseded for state resets by backend/src/scripts/vendor-sync-truncate-state.ts ; product purge superseded by the `POST /admin/vendor-sync/purge-products` route
- problem: dev-wipe deletes each state table by collecting all row ids into one array and issuing `WHERE id IN (...)`. At prod scale (372k `vendor_stock_staging` rows) this overflows knex's query compiler (`Maximum call stack size exceeded`). `--purge-products` also deletes products one `deleteProductsWorkflow` chunk at a time over the network — hours from a local machine via the Railway proxy. Both surfaced during the WB-051 migration; workarounds (truncate script + admin route) already exist.
- fix: for state resets, delegate to `vendor-sync-truncate-state.ts` (single TRUNCATE) or chunk the id deletes; for product purge, point operators at the server-side `purge-products` route. Consider folding both into dev-wipe or deprecating its bulk paths.
- verify: a wipe + purge against a prod-size DB completes in seconds (state) / minutes (products, server-side) without stack overflow.
- done: 2026-06-28 — extracted the atomic `TRUNCATE … RESTART IDENTITY` into a shared `truncateVendorState(knex)` helper (`backend/src/modules/vendor-sync/utils/truncate-state.ts`); both `vendor-sync-dev-wipe.ts` and `vendor-sync-truncate-state.ts` delegate to it. dev-wipe's per-id `WHERE id IN (...)` state-delete (the knex stack-overflow at 372k rows) is gone; it keeps its `--confirm-host` guard + chunked `--purge-products` workflow path. One implementation, unit-tested (table list + exact SQL). Subagent-driven.
- refs: discovered during WB-051 (2026-06-23) ; done via [docs/done/plans/2026-06-28-wheel-discovery-vendor-ops.md](../done/plans/2026-06-28-wheel-discovery-vendor-ops.md)

---

### WB-053 · Discovery `/store` browse capped at Meilisearch default `maxTotalHits=1000`   [LOW]
- status: done
- area: backend/search + storefront/discovery
- evidence: backend/medusa-config.js (products `indexSettings.pagination.maxTotalHits = 10000`)
- problem: the unfiltered `/store` browse paginates at most 1,000 results (~84 pages × 12) because the products index uses Meilisearch's default `maxTotalHits=1000`; the "N results" header reflects the cap, not the real catalog (2,670 wheels). Surfaced during the WB-051 re-import — the page count looked unchanged because the catalog already exceeded 1,000 before. Filtered/searched result sets under 1,000 are unaffected, so it does not hide products from users who narrow by vehicle/brand/size.
- fix: set `pagination: { maxTotalHits: <N> }` in the products `indexSettings` (medusa-config.js) and redeploy so the plugin pushes it; weigh the deep-pagination perf cost. Optionally show a "1,000+" affordance instead of an exact count.
- verify: with `maxTotalHits` raised, the unfiltered `/store` paginates past 84 pages and the header count tracks the Meili doc count.
- done: 2026-06-26 — `pagination: { maxTotalHits: 10000 }` added to the products `indexSettings` (folded into G2). **Activates on next deploy / Meili settings re-sync** (the plugin pushes index settings on boot) — not yet live until then. `node --check` validated.
- refs: discovered during WB-051 (2026-06-23) ; shipped with [docs/done/plans/2026-06-26-checkout-cart-transactable.md](../done/plans/2026-06-26-checkout-cart-transactable.md)

---

### WB-054 · Medusa v2 gift-card apply/remove (backend workflow + storefront UI)   [MEDIUM]
- status: todo
- area: backend/cart + storefront/checkout
- evidence: storefront/src/lib/data/cart.ts (dead v1 stubs removed in WB-036) ; storefront/src/modules/checkout/components/discount-code/
- problem: the storefront had commented-out v1 gift-card stubs (`gift_cards: [{ code }]` on cart update) that no longer match the Medusa v2 API and were wired to no UI. They were removed in WB-036. There is currently NO working gift-card redemption path.
- fix: implement gift-card apply/remove with the Medusa v2 approach (gift-card module + the correct cart line/promotion mechanism), plus a storefront UI entry point (likely alongside the discount-code component) and a server action in `lib/data/cart.ts`.
- verify: a customer can redeem a valid gift card at checkout, see the credit applied to the order total, and remove it; the credit persists through order placement.
- refs: split out of [[WB-036]] (2026-06-26)

---

### WB-055 · Remaining "Medusa Store" boilerplate copy outside order/checkout   [LOW]
- status: todo
- area: storefront/account + storefront/layout + storefront/collections + storefront/categories
- evidence: storefront/src/modules/account/.../register ; collections/categories metadata ; modules/layout side-menu footer (`© Medusa Store`)
- problem: WB-047 rebranded `modules/order` + `modules/checkout` but left "Medusa Store" boilerplate copy elsewhere — the account register blurb, collections/categories page metadata, and the side-menu `© Medusa Store` footer.
- fix: sweep the remaining "Medusa Store" occurrences and replace with "Wheel Builds" (or the appropriate brand string / metadata).
- verify: `grep -rn "Medusa Store" storefront/src` returns only API references ("Medusa Store API"), no brand copy.
- refs: flagged in the WB-047 / G2 final review (2026-06-26)

---

### WB-056 · PDP data honesty & fitment polish   [MEDIUM]
- status: done
- area: storefront/pdp
- evidence: storefront/src/modules/product-detail/components/specs/spec-rows.ts ; storefront/src/lib/data/products.ts (+weight) ; storefront/src/modules/product-detail/components/hero/purchase-panel.tsx (fitsVehicle) ; gallery.tsx (swatch)
- problem: the wheel PDP (1) showed "CONFIRMED FIT · {vehicle}" for ANY wheel whenever a garage vehicle existed (the purchase-panel chip never checked fitment — only the Fitment section did); (2) showed static placeholders, notably "Per-wheel weight: 0 lb" — the weight IS persisted on `product.weight` but the PDP query didn't fetch it, and several specs rendered "0 lb"/"0 mm"/"1" when the real value was missing; (3) rendered the finish swatch as a 72px drawn wheel floating in a full-width empty box.
- fix: chip reuses the pure `fitsVehicle`; fetch `+weight` + round it; hide zero/missing numerics via pure `buildSpecRows`; size the swatch.
- verify: a garage vehicle that doesn't fit shows "MAY NOT FIT" (not green); a wheel with feed weight shows real lb, one without hides the row (no "0 lb"); the swatch is a tidy proportionate square.
- done: 2026-06-26 — Fix A: purchase-panel chip uses `fitsVehicle(product, active).fits` (same fn as the Fitment section → they can't disagree): fits → "CONFIRMED FIT", in-garage-no-fit → "MAY NOT FIT", none → pick-a-vehicle. Fix C: `+weight` added to `getProductByHandle`; `weightLb` rounded to 1 decimal at the loader source (kills the grams round-trip's 31.9997); pure unit-tested `buildSpecRows` omits any 0/missing numeric (weight/load/bore) + finishOptions=1 instead of a fake placeholder; variant-picker weight stat + tooltip gated too. Fix B: finish swatch → fixed 96px square with an 80px wheel (was 72px in a full-width box). Storefront-only — no backend/migration/re-import (weight was already saved, just unfetched). Subagent-driven (3 tasks + reviews + opus final "ready to merge"). storefront 95 tests. Live PDP smokes deferred to pre-deploy.
- refs: design [docs/done/specs/2026-06-26-pdp-data-fitment-polish-design.md](../done/specs/2026-06-26-pdp-data-fitment-polish-design.md) ; plan [docs/done/plans/2026-06-26-pdp-data-fitment-polish.md](../done/plans/2026-06-26-pdp-data-fitment-polish.md)

---

### WB-060 · Fitment-aware PDP — filter variants + colors to the active vehicle   [MEDIUM]
- status: done
- area: storefront/product-detail + storefront/discovery
- evidence: storefront/src/modules/product-detail/data/fit-view.ts (`buildFitView`) ; storefront/src/modules/product-detail/components/hero/index.tsx + hero/fit-banner.tsx ; storefront/src/modules/discovery/components/grid/product-card.tsx (`?fit=1`)
- problem: arriving via the "fits my car" flow, the PDP defaulted to the first bolt pattern / size / finish — which, because the discovery fit filter narrows by bolt pattern ONLY, could be a variant that does NOT fit the vehicle. A shopper could buy wheels that don't fit even though they came through fitment.
- fix: carry a `?fit=1` flag from fit-mode discovery results to the PDP; when set with an active vehicle that has wheel-size windows, filter the hero's bolt/size/offset/color options to fitting variants + default to a fitting one, with a warned "Show all" escape. Full-catalog visitors unchanged.
- verify: from the fitment results, a wheel's PDP shows only fitting sizes/colors + defaults to a fitting variant; "Show all" prompts a confirmation before revealing non-fitting options; a full-catalog visit shows everything as before.
- done: 2026-07-01 — pure `buildFitView(product, vehicle)` computes the fitting bolt-pattern/size/finish subsets from the vehicle's wheel-size windows (reuses the `fits-vehicle` gate; `hasFit:false` → show everything when no windows or nothing fits). The shared discovery card appends `?fit=1` in fit mode only (its other uses — PDP related, home rail — default off). The hero reads `?fit=1` + `useGarage().active`, filters the pickers + re-snaps the selection to a fitting variant, and a `FitBanner` offers a "Show all" escape gated by a shadcn Dialog confirmation (per-visit ack); the hero is wrapped in `<Suspense>` (it now uses `useSearchParams`). Storefront-only, no backend/migration. Subagent-driven (3 tasks + per-task reviews + opus final "ready to merge"). storefront 117 tests. Builds on the same-day `fitsVehicle` hardening (a shared bolt pattern alone no longer reads as "CONFIRMED FIT"). **Follow-up correction (d03cc18): bolt pattern is the PRIMARY gate — the first cut required the vehicle's full wheel-size spec windows, so a vehicle with a bolt pattern but no size ranges on file fell back to showing ALL patterns + "MAY NOT FIT". Now `buildFitView` filters to bolt-compatible variants (hides non-matching patterns), refines by diameter/width/offset windows only when they leave options, and never falls through to the full set once a vehicle with a bolt pattern is present; the chip reads "FITS YOUR <car>" in fit mode; "Show all" (the only route to everything) warns these WON'T fit.**
- follow-up (2026-07-01, completes the arc): **(1) Discovery↔PDP consistency (Option A).** Discovery filtered by bolt pattern ONLY (Meili product-level facets can't express "the SAME variant is 5x130 AND a fitting size" for multi-pattern wheels), so a wheel could appear in the fit results yet say "doesn't fit" on its PDP. Added pure `productHasFittingVariant(variants, vehicle)` (mirrors the PDP per-variant gate) + a discovery post-filter: fit mode pulls up to 200 bolt-pattern candidates from Meili, fetches their real variants via the Store API, drops any product with no genuinely-fitting variant, then paginates + recomputes facets in memory (degrades to coarse on fetch error). `DiscoveryQuery.vehicleFitment` + `fitb/fitd/fitw/fito` window params + `discoveryCacheKey` carry the vehicle spec server-side. **(2) FitmentSync async-window bug.** `useGarage`'s snapshot memo compared only vehicle id/count, so an in-place `update(id, {windows})` (YMM adds the vehicle, then writes the wheel-size windows a beat later) never re-rendered — the window params only reached the URL after a refresh/car-switch. Memo now keys on a full content signature. **(3) "FITS YOUR CAR" chip honesty.** The discovery header chip keyed on `active` existing, so it claimed a fit even at `fit=0` (Show all) or for a no-data vehicle; now gated on a real fit param, else "Select a vehicle". **(4) PDP purchase-panel chip.** It used the product-level `fitsVehicle(product, active)` ("fits anywhere"), so after "Show all" a non-fitting size/offset/colour still read "FITS YOUR CAR"; now computed from the SELECTED variant via `variantFitsVehicle`, so it flips between "FITS"/"MAY NOT FIT" as settings change. storefront 125 tests (+`product-has-fitting-variant`).
- refs: design [docs/done/specs/2026-07-01-fitment-aware-pdp-design.md](../done/specs/2026-07-01-fitment-aware-pdp-design.md) ; plan [docs/done/plans/2026-07-01-fitment-aware-pdp.md](../done/plans/2026-07-01-fitment-aware-pdp.md) ; [[WB-061]] (loading bar) ; [[WB-062]] (OEM→default)

---

### WB-061 · No navigation loading feedback (soft same-route transitions look dead)   [MEDIUM]
- status: done
- area: storefront (app-wide) + discovery + search
- evidence: storefront/src/components/progress-bar.tsx ; storefront/src/app/layout.tsx ; garage-pane/ymm-pane/fitment-sync/use-discovery-query now import `useRouter` from `@bprogress/next/app`
- problem: pressing "see your fit" closed the drawer and then showed NOTHING for 3–4s before the wheels popped in — testers (incl. the owner) thought it was broken. Root cause: navigating `/store → /store?fit=…` is a same-route search-param change, which Next renders "softly" (old page stays on screen, no `loading.tsx`) while the server re-renders. Every filter/sort/pagination change and the fit-flow navigation had zero indicator.
- fix: an app-wide top progress bar (`@bprogress/next`, WB orange, 3px, `shallowRouting` so same-route param changes trigger it), mounted in the root layout. `<Link>` clicks fire it automatically; programmatic pushes only fire it via bprogress's own `useRouter`, so the fit buttons, the Discovery query hook, and FitmentSync's refinement `replace` were switched to it. The in-drawer spinner already covered the pre-nav fitment fetch, so the flow is now continuous: click → spinner → top bar → wheels.
- verify: pick a car → press fit → the orange bar sweeps the top during the wait, then wheels; filters/sort/pagination/nav links all show it. (New dep + root-layout provider → dev server must be fully restarted; storefront rebuild to deploy.)
- notes: `@bprogress/core/css` imported by the provider (bar is class-styled, not JS-injected). tsconfig `moduleResolution: node` can't read the package `exports` map → an ambient shim (`src/types/bprogress-next.d.ts`) re-exports the shipped `/app` types; runtime unaffected. The 3–4s render itself is unchanged (fit-mode does Meili + a 200-candidate Store-API variant fetch + post-filter) — this makes the wait legible, not faster; a real perf pass (cache candidate variants / lower the cap / precompute a fitment key in Meili) is a separate item.
- refs: fit-flow arc [[WB-060]]

---

### WB-062 · PDP auto-fit offset mislabeled "OEM" (implies a per-vehicle factory match)   [LOW]
- status: done
- area: storefront/product-detail
- evidence: storefront/src/modules/product-detail/components/hero/auto-fitment-card.tsx + advanced-fitment-panel.tsx ; data/group-sizes.ts (`defaultOffsetMm`) ; data/types.ts
- problem: the auto-picked offset was badged "OEM" ("OEM-matched offset" / "Auto-fitted · standard offset"), implying it was matched to the shopper's specific car's factory spec. It isn't — `oemOffsetMm` was simply the wheel's first-listed offset variant for the chosen size (group-sizes.ts). Same honesty class as WB-056.
- fix: rename the user-facing copy and the supporting identifiers to "default": badge "OEM"→"DEFAULT"; "OEM-matched offset"→"the wheel's default offset"; "Auto-fitted · standard offset"→"Auto-fitted · default offset"; "Reset to standard"→"Reset to default". `SizeOption.oemOffsetMm`→`defaultOffsetMm`, `isOem`→`isDefault`, `onResetToOem`→`onResetToDefault`; type comment now states "NOT a per-vehicle OEM lookup". Left the genuinely-accurate "OEM bolt pattern" fitment comment (bolt pattern really is a factory spec). A real per-vehicle OEM-offset centre (from wheel-size) remains a future item.
- verify: any wheel PDP shows "Auto-fitted · default offset" + a "DEFAULT" offset badge; overriding still flips to "Custom fitment override" with "Reset to default". storefront 125 tests (resolve-variant + fit-view green).
- refs: sibling honesty items [[WB-056]] · [[WB-029]]

---

### WB-057 · Newsletter hardening (unsubscribe + rate-limit + double-opt-in)   [LOW]
- status: todo
- area: backend/newsletter + storefront/home
- evidence: backend/src/api/store/newsletter/route.ts (public, unauthenticated, no abuse guard) ; backend/src/modules/newsletter/service.ts (subscribe only)
- problem: the launch newsletter (WB-023) persists subscriptions but has no abuse protection beyond the publishable-key header, no unsubscribe path, and no double-opt-in confirmation. Fine for launch, but the public `POST /store/newsletter` is a spam target and there's no way to honor an unsubscribe request.
- fix: add rate-limiting (per-IP / per-window) on the route; an unsubscribe endpoint + tokenized link; optional double-opt-in confirmation email (reuses the Resend notification module).
- verify: rapid repeated POSTs from one source are throttled; a subscriber can unsubscribe via a link and the row is soft-deleted (the unique email index is already partial on `deleted_at IS NULL`, so re-subscribe works); a confirmation email is sent before the subscription is marked confirmed.
- refs: split out of [[WB-023]] / G4 final review (2026-06-26)

---

### WB-058 · Real license-plate → YMM lookup provider   [LOW]
- status: todo
- area: storefront/fitment
- evidence: storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx (the disabled stub was removed in WB-045)
- problem: WB-045 removed the non-functional "search by license plate" stub. There is currently no way to resolve a plate (+ state) to a Year/Make/Model so the garage can be populated from a plate.
- fix: integrate a commercial plate-decode API (plate+state → VIN → YMM; NHTSA vPIC is VIN-only, so a paid plate→VIN provider is needed) behind a backend route, then re-add a license-plate entry point in the YMM pane wired to it (or a dedicated tab).
- verify: entering a valid plate + state returns a real vehicle match that can be saved to the garage; invalid input surfaces a clear error; the entry point is only shown when the provider is configured.
- refs: split out of [[WB-045]] / G7 (2026-06-26)

---

### WB-059 · Finish as a variant axis (collapse colors into one product)   [HIGH]
- status: done
- area: backend/vendor-sync + backend/search + storefront/discovery + storefront/pdp
- evidence: backend/src/modules/vendor-sync/adapters/wheelpros-wheels/group-key.ts ; backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts (7-axis) ; backend/src/modules/vendor-sync/pipeline/build-metadata.ts ; backend/src/modules/vendor-sync/search/build-search-document.ts (finishes[]) ; storefront/src/modules/product-detail/data/finish-options.ts ; storefront/src/modules/product-detail/components/hero/{index,gallery}.tsx
- problem: wheels identical except color/finish imported as N separate products (e.g. `petrol-p3b-matte-black` + `petrol-p3b-gloss-silver`) instead of ONE product with selectable finish variants.
- fix: drop finish from the wheel group key (`Brand|DisplayStyleNo`); make finish the 7th variant axis (raw label, blank→`—`); move finish + per-finish `image_url` to variant metadata; product `images` = union of finish images; Meili emits multi-valued normalized `finishes`; Discovery + PDP read it (PDP finish selector swaps image + per-finish size matrix). Old per-finish URLs 404.
- verify: a known multi-color model imports as ONE `/products/<brand>-<style>` with a working finish selector (image + price + sizes change per finish); Discovery shows it under each normalized bucket; old `…-<finish>` URL 404s; apply errors ≈ 0; product count drops / variant count rises.
- done: 2026-06-27 — **CODE merged to `main` (Phases 1-4, commits e6455c9..10cebfb, merge 77c10df) AND prod cutover RUN — LIVE.** Subagent-driven (10 tasks + per-task reviews + opus final review "Ready to merge: Yes"). Backend vendor-sync 242 tests / storefront 105. **Phase 5 cutover executed** (purge-products → `vendor-sync-truncate-state.ts` → re-import → backend restart for Meili `finishes` settings): the re-import collapsed **2,670 → 1,724 groups / 29,445 variants / 16,150 stock levels / 0 errors** (variants held steady → no SKU loss; ~946 per-color products merged into their models). User-verified live: a multi-color model is ONE `/products/<brand>-<style>` with a working finish selector; Discovery finish facet works; old `…-<finish>` URLs 404. Axis-key integrity (variantAxisKey↔axisKeyFromMetadata 7-tuple) held — apply errors 0.
- refs: design [docs/done/specs/2026-06-27-finish-as-variant-design.md](../done/specs/2026-06-27-finish-as-variant-design.md) ; plan [docs/done/plans/2026-06-27-finish-as-variant.md](../done/plans/2026-06-27-finish-as-variant.md)
