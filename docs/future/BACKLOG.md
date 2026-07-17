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

- **G1 · Vendor-sync productionization (async + scale)** `[L · needs Redis worker]` — ✅ **DONE 2026-07-06** (WB-011 off-request run enqueue, WB-012/013 off-request approve/replay/replay-sku, WB-014 concurrent apply + promise-memoized brand cache, WB-015 streaming CSV parse, WB-017 durable private-bucket feed archive opt-in, WB-018 stock-only fast path + cron, WB-037 DB-backed cross-process cancel).
- **G2 · Checkout & cart (make it transactable)** `[M–L]` — ✅ **DONE 2026-06-26** (WB-033 stall, WB-034 stock cap, WB-035 express-pay/Affirm env-gated, WB-036 discount fix, WB-047 copy + WB-053 browse cap). Follow-ups: WB-054 (gift cards v2), WB-055 (brand-copy sweep).
- **G3 · PDP correctness & polish** `[S–M]` — ✅ **DONE 2026-06-25** (WB-048 BLANK gate, WB-029 placeholders, WB-030 finish-normalizer twin).
- **G4 · Home & merchandising** `[M]` — ✅ **DONE 2026-06-26** (WB-004 Featured Blocks real curated products + Build Gallery → catalog-wall, WB-023 newsletter persistence, WB-028 merchandising copy → config + live brand count). Follow-up: WB-057 (newsletter hardening — unsubscribe/rate-limit/double-opt-in).
- **G5 · Discovery & search** `[S]` — ✅ **DONE 2026-06-28** (WB-021 Meili result cache via `unstable_cache`, WB-046 dead category facet removed). (browse `maxTotalHits` cap WB-053 ✅ done 2026-06-26 via G2.)
- **G6 · Catalog breadth & pricing** `[L–XL]` — **WB-005 tire store ✅ DONE + LIVE (prod cutover run 2026-07-03: ~1,000 grouped tire products, `product_type = "tire"` Meili docs/facets, `/tires` + tire PDP live).** **WB-063 forward tire fitment ✅ DONE 2026-07-03** (OEM-size join off the cached `by_model`: `/tires` fit filter + FITS badges + PDP chip; no new API/migration). Remaining: markup/MAP/margin pricing (WB-024), de-hardcode bootstrap identity + vendor roster (WB-025/026). → WB-024, WB-025, WB-026
- **G7 · Account & garage** `[S–M]` — ✅ **DONE 2026-06-26** (WB-032 account Garage tab/route + GarageManager, WB-022 atomic guest→login merge w/ stable idempotent client_ids, WB-045 removed license-plate stub). Follow-up: WB-058 (real plate→YMM provider). **⚠️ Superseded 2026-07-09 by WB-076: the garage (account tab, merge, multi-vehicle list) is RETIRED per client decision — one cached vehicle only; the G7 code is mothballed behind `GARAGE-DISABLED` seams, not deleted. WB-058 is moot while retired.**
- **G8 · Admin & ops tooling** `[S]` — admin UI + ops slice ✅ **DONE 2026-06-28** (WB-006 vendor-sync admin console, WB-044 rename `teraflex` fixtures, WB-052 scale-safe dev-wipe). Remaining: WB-031 (seed shipping options + reply-to — general commerce, not wheel; deferred). → WB-031
- **G9 · Audit remediation — honest state & silent-failure elimination** `[L–XL · multi-session]` — remediate the 2026-07-06 full done-specs audit: **76 unique findings (9 CONFIRMED high, all vendor-sync lifecycle; 47 pending verification)**. Theme + raw logs: [future/plans/2026-07-06-audit-remediation-theme.md](plans/2026-07-06-audit-remediation-theme.md) (+ 4 finding-log docs). Convert per-cluster (sync-lifecycle-integrity, fitment-truth, checkout-money-honesty, garage-session-integrity, discovery-honest-signals, docs-truth-sweep) into specs/plans before implementing. **Cluster 1 `sync-lifecycle-integrity` (WB-070) ✅ DONE 2026-07-06** (the 9 confirmed + folded #11/#16). **Cluster 2 `checkout-money-honesty` (WB-071) ✅ DONE 2026-07-06** (9 findings F-A…F-I). **Cluster 3 `fitment-truth` (WB-072) ✅ DONE 2026-07-07** (17 findings B1–B8/S1–S9, re-verified vs current main first via 2 parallel verifiers; 16-commit branch + review fix, opus whole-branch review). **Cluster 4 `garage-session-integrity` (WB-073) ✅ DONE 2026-07-07** (10 findings G1–G10, re-verified first; 19-commit branch, per-task review + fix loops + opus whole-branch review MERGE-READY). **Cluster 5 `discovery-honest-signals` (WB-074) ✅ DONE 2026-07-08** (8 findings D1–D8, re-verified first; storefront-only, per-task review + fix loops + opus whole-branch review MERGE-READY; D3 disjunctive deferred via sanctioned fallback). **Cluster 6 `docs-truth-sweep` (WB-075) ✅ DONE 2026-07-08** (5 DOC findings + doc-drift, re-verified first; ran LAST to re-baseline the tsc/test counts — deleted dead code (tsc 14→12), atomic newsletter subscribe, module-status truthiness, corrected STATUS/README/CLAUDE; opus whole-branch review MERGE-READY). **✅ EPIC COMPLETE — all 6 clusters shipped + merged (WB-070…WB-075); WB-069 umbrella DONE.** → WB-069…WB-075
- **G10 · Launch readiness — fitment truth v2 + P0 completeness** `[L · multi-session]` — remediate the 2026-07-10 audit ([future/plans/2026-07-10-launch-readiness-audit.md](plans/2026-07-10-launch-readiness-audit.md)): the user-confirmed fitment FALSE NEGATIVES (three-tier verdict + multi-trim/stock-inclusive windows, WB-077), transactional email + password reset (WB-078), the B1–B11 bug batch (WB-079), Stripe capture + US tax + live cutover (WB-080), ops hardening (WB-081), SEO/observability (WB-082), docs sweep #2 (WB-083, runs last). Consolidated design: [done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md). Build order: WB-077 → 078 → 079 → 080 → 081 → 082 → 083. **WB-077 ✅ DONE + merged 2026-07-10** (merge `39c273a`; SDD + opus whole-branch review). **WB-078 ✅ DONE + merged 2026-07-10** (merge `7ec274e`; SDD + opus whole-branch review). **WB-079 ✅ DONE + merged 2026-07-10** (merge `8094f10`; SDD per-bug + opus whole-branch review; backend tsc→0). Decisions D1 (include+badge) & D4 (reset-email button) resolved as defaults; D2/D3 (Stripe capture / US tax) belong to WB-080. **WB-080 ✅ DONE 2026-07-11** (merge `de8c0e8`; `capture: true` [D2], US tax script + seed [D3], [go-live runbook](../reference/go-live-runbook.md) — live-cutover/tax-rates/prod-scripts are OPS steps in the runbook). **WB-081 ✅ DONE 2026-07-11** (merge `f645a66`; vendor-sync watchdog alerts + fail-open middleware + 5 policy pages + template drift). **WB-082 ✅ DONE 2026-07-11** (merge `03c0480` + review fix `09fd966`; robots/sitemap/error boundaries/env-gated analytics; Sentry deferred pending a vendor account). **WB-083 ✅ DONE 2026-07-11** (docs sweep; this file + STATUS re-baselined). Whole-stack adversarial review (28-agent workflow) confirmed + fixed 3 findings pre-merge. **✅ EPIC COMPLETE — G10 fully executed; what separates the store from LIVE is the ops runbook, not code.**
- **G11 · Storefront trust & correctness — 2026-07-13 UX audit fixes** `[XL · multi-session]` — ✅ **EPIC COMPLETE.** Remediated the [2026-07-13 full-site UX & product-logic audit](plans/2026-07-13-ux-completeness-audit.md) (7 parallel surface auditors, ~60 unique findings; consolidated design: [specs/2026-07-13-ux-completeness-fixes-design.md](specs/2026-07-13-ux-completeness-fixes-design.md)): dead nav/footer chrome + fabricated drawer content (WB-085), legacy listing retirement (WB-086), search that finds products (WB-087), discovery filter truth (WB-088), catalog lifecycle integrity — index eviction/phantom stock/$0 (WB-089), PDP purchase honesty (WB-090), fitment honesty completion (WB-091), cart/checkout correctness (WB-092), account truth (WB-093), email reliability (WB-094), SEO de-boilerplate (WB-095), a11y & polish (WB-096), trim honesty (WB-104). **WB-089 ✅ DONE 2026-07-13, merged into `main`** (SDD per-task + opus whole-branch review + fix wave; test:sync 359/6-skip, tsc 0, build 0). **WB-085/087/088 ✅ DONE 2026-07-14 (G11 Wave 1), merged into `main`** (per-chunk + cross-chunk opus review). **WB-090/091/104 ✅ DONE 2026-07-15 (G11 Wave 2), merged into `main`** (per-chunk [3× opus] + cross-chunk opus review). **WB-092/093/094 ✅ DONE 2026-07-15 (G11 Wave 3), merged into `main`** (per-chunk [2× opus] + cross-chunk opus review). **WB-086/095/096 ✅ DONE 2026-07-16 (G11 Wave 4, final wave)** on branch `feat/g11-wave4-cleanup` (chunk tips 086=`40cb546`, 095=`e548db7`, 096=`25e776c`; three chunks, storefront-only, 0 backend files changed; per-chunk opus review), merging into `main` as this closeout lands. **Current `main` (`d92089e`) is the post-Wave-3 merge; Wave 4 is the merge this closeout accompanies.** Tracked follow-ups from the Wave 4 review: WB-105…WB-109. → WB-085…WB-096, WB-104
- **G12 · Conversion & completeness features — 2026-07-13 UX audit** `[L]` — the missing-but-expected layer from the same audit: guest order lookup (WB-097), PDP merchandising — set framing/SKU/stock-ETA (WB-098), brand & style landing pages (WB-099), discovery availability signals (WB-100, depends WB-089), journey connectors (WB-101), staggered fitment (WB-102, XL — design first), post-purchase self-service (WB-103). **Wave A ("discovery & merchandising" sub-wave) ✅ DONE 2026-07-17 — WB-098/099/100** (branch `feat/g12-wave-a-discovery-merch`, chunk tips 098=`0a2b0b1`, 099=`f483cd3`, 100=`9185f52`; per-chunk opus/sonnet reviews + a cross-chunk opus review, no Critical/Important). Remaining G12: WB-097 (guest order lookup), WB-101 (journey connectors), WB-102 (staggered fitment, XL — design first), WB-103 (post-purchase self-service). Tracked follow-ups from the Wave A review: WB-110…WB-112. → WB-097, WB-101…WB-103

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
- status: done
- area: backend/vendor-sync + backend/search + storefront/discovery + storefront/pdp
- evidence: backend tire pipeline (model-key/group-key/tire-facets/tire-grouping/apply/build-search-document + medusa-config facets) ; storefront/src/modules/tire-discovery/** (SP2) ; storefront/src/modules/product-detail/data/tire/** + components/tire/** + templates/tire-detail.tsx + the get-product/types/page `kind` seam (SP3)
- problem: tire records go through the per-SKU one-product-per-row path with no grouping rule; buildSearchDocument returns a non-wheel stub for tires so they are not indexed in Meilisearch for discovery.
- fix: **CODE-COMPLETE across 3 sub-projects (all merged/on-branch); remaining = prod cutover only.** **SP1 (backend grouping + indexing) DONE + merged**: tires group by Brand + extracted model (per-SKU fallback), canonical size = variant axis, indexed as `product_type = "tire"` with facets. **SP2 (tire discovery) DONE + merged**: a parallel `modules/tire-discovery/` module + `/tires` faceted catalog (rim/size/type/speed/load + brand/price). **SP3 (tire PDP) DONE** on branch `feat/tire-pdp`: the shared `/products/[handle]` route branches on a `kind` discriminant → a parallel tire detail (rim-chips-gate-size selector → add-to-cart, model-level specs, related-by-brand via SP2) — the wheel PDP untouched beyond the discriminant; no fitment. **Remaining: the prod cutover** (deploy → backend restart for Meili tire settings → `vendor-sync:dry-run wheelpros-tires` + apply) — this is the single deploy step that makes the tire store live; flip WB-005 to `done` once it runs. Tire fitment + MAP pricing explicitly out of scope.
- verify: after the tire feed apply, tires are grouped Medusa products with size variants; Meili has `product_type = "tire"` docs + facets; `/tires` renders a faceted catalog and a tire card → a tire PDP with a size selector + working add-to-cart. **Gates met: SP1 backend 288 ; SP2+SP3 storefront vitest 153 (28 files), tsc 0-new, routes compile.**
- done: 2026-07-03 — **prod cutover RUN — tire store LIVE.** All 3 sub-projects merged to `main` (SP1 backend grouping+indexing, SP2 `/tires` discovery, SP3 tire PDP). Prod cutover: after fixing the tire SFTP env (the `VENDOR_WHEELPROS_TIRE_SFTP_PATTERN` initially carried the wheel pattern), the `wheelpros-tires` dry-run staged **4,109 new** and the apply created ~1,000 grouped tire products (Brand+model, canonical size = variant axis) with per-warehouse inventory + `product_type = "tire"` Meili docs/facets; user-verified `/tires` renders the faceted catalog and tire PDPs. Two Toyo flotation-tire groups (`OPMT 33x R15LT C6`, `OPMT 38x R18LT D8`) failed to parse — deferred polish, not blocking. Tire fitment shipped separately as [[WB-063]] (forward). MAP/margin pricing (WB-024) + de-hardcoded bootstrap (WB-025/026) remain open under G6.
- refs: SP1 [spec](../done/specs/2026-07-02-tire-store-design.md)+[plan](../done/plans/2026-07-02-tire-store-backend.md) ; SP2 [spec](../done/specs/2026-07-02-tire-discovery-design.md)+[plan](../done/plans/2026-07-02-tire-discovery.md) ; SP3 [spec](../done/specs/2026-07-02-tire-pdp-design.md)+[plan](../done/plans/2026-07-02-tire-pdp.md) ; cutover runbook [plan](../done/plans/2026-07-02-tire-store-cutover.md) ; fitment [[WB-063]]

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
- status: done
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/route.ts:63-69
- problem: the POST /admin/vendor-sync/runs endpoint runs the full sync pipeline synchronously inside the HTTP request handler; large feeds will timeout or block the server.
- fix: enqueue the sync as a background job (workflow or queue) and return a run id immediately; the client polls for status.
- verify: POST /admin/vendor-sync/runs returns a run id immediately (< 1s); the sync proceeds in the background; the run status transitions to completed/failed asynchronously.
- done: 2026-07-06 — `run()` split into `startRun` (reserve run row) + `executeRun` (pipeline body). POST /admin/vendor-sync/runs now `startRun`s then **emits a `vendor-sync.execute` event** (via `req.scope.resolve(Modules.EVENT_BUS)`) and returns 201 with the run id immediately; the subscriber `src/subscribers/vendor-sync-run.ts` runs `executeRun` off-request on **its global container**. (An initial `enqueueRun`/`setImmediate(this.container_)` approach was replaced after the final whole-branch review caught that the module-scoped constructor container can't resolve the core region/product/inventory modules — only a caller's global container can.) The 12h cron still uses the blocking `run()` variant. Verified `executeRun` byte-identical to the old in-request body; `test:sync` green, `medusa build` exit 0 (subscriber registered).
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

### WB-012 · Approve-and-apply blocks the request (heaviest apply)   [MEDIUM]
- status: done
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/[id]/approve/route.ts:28
- problem: the approve endpoint calls the full apply pipeline synchronously; the apply can take minutes for large feeds, causing HTTP timeouts.
- fix: move apply to a background job triggered by the approve action; return 202 Accepted with a status poll URL.
- verify: POST approve returns 202 in under 1s; apply proceeds in the background; the run transitions from approved → applying → completed/failed asynchronously.
- done: 2026-07-06 — POST .../approve validates (status pre-checks preserved) then **emits a `vendor-sync.approve` event** and returns 202 immediately; the `vendor-sync-run` subscriber runs `approveAndApply` off-request on its global container. `approveAndApply`'s internals untouched.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

### WB-013 · Replay run / replay SKU block the request   [MEDIUM]
- status: done
- area: backend/vendor-sync/api
- evidence: backend/src/api/admin/vendor-sync/runs/[id]/replay/route.ts:26
- problem: replay endpoints run synchronously in-request, same issue as approve (WB-012).
- fix: enqueue replay as a background job; return 202 with a status poll URL.
- verify: POST replay returns 202 in under 1s; replay proceeds in background; run status updates asynchronously.
- done: 2026-07-06 — both replay endpoints (run + SKU) now return 202 immediately by **emitting `vendor-sync.replay` / `vendor-sync.replay-sku` events** (same event→subscriber pattern as WB-012); the subscriber runs `replayRun`/`replaySku` off-request on its global container. `replayRun`/`replaySku` internals untouched.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

### WB-014 · Apply loop sequential; `applyConcurrency` is dead config   [MEDIUM]
- status: done
- area: backend/vendor-sync/pipeline
- evidence: backend/src/modules/vendor-sync/pipeline/apply.ts:148-201
- problem: the apply loop processes one product group at a time sequentially; the `applyConcurrency` config option is read but never used — it is dead configuration.
- fix: implement a real concurrency limit using the applyConcurrency value (p-limit or similar) so multiple product groups are applied in parallel up to the configured limit.
- verify: with applyConcurrency = 3, the apply loop processes up to 3 product groups concurrently; the config value is actually respected.
- done: 2026-07-06 — a pure `mapWithConcurrency` helper (no new dep) drives all 3 apply phases up to `applyConcurrency` (`VENDOR_SYNC_APPLY_CONCURRENCY`, default 8, now genuinely load-bearing) with an async `isCancelled` shouldStop gate + between-phase recompute; the brand-collection cache became a promise-memoized `Map<string, Promise<string>>` so concurrent groups sharing a brand don't create duplicate collections, and a rejected lookup un-poisons the cache entry so retry is possible.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

### WB-015 · CSV read fully into memory + parsed before yielding   [MEDIUM]
- status: done
- area: backend/vendor-sync/adapters
- evidence: backend/src/modules/vendor-sync/adapters/wheelpros-wheels/parse.ts:18-24
- problem: the CSV parser reads the entire file into memory before yielding records; large feeds risk OOM errors and delay time-to-first-record.
- fix: switch to a streaming CSV parse that yields records as they are parsed (e.g. csv-parse stream API).
- verify: parsing a large feed does not load the full file into memory at once; the first record is available before the file is fully read (testable by timing or memory profiling).
- done: 2026-07-06 — both wheel and tire `parse.ts` now delegate to a shared streaming `csv-parse` implementation (`adapters/csv-stream.ts`); warehouse columns are derived from the CSV header via csv-parse's `columns:(header)=>...` callback instead of the first data record, fixing a silent stock-column loss under ragged first rows (regression test proved RED-against-old, GREEN-with-fix). `papaparse`/`@types/papaparse` are now dead deps (not yet removed).
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

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
- status: done
- area: backend/vendor-sync/utils
- evidence: backend/src/modules/vendor-sync/utils/archive.ts:12-39
- problem: feed archives are written to local disk; on Railway the disk is ephemeral and archives are lost on redeploy; the archiveBucket config option is present but never used.
- fix: implement archive upload to the configured object storage bucket (MinIO/S3) using the existing archiveBucket option. See also WB-042 (durable archiving — deferred Plan 4+).
- verify: after a sync run, the feed archive is uploaded to object storage and persists across server restarts; archiveBucket config drives the destination.
- done: 2026-07-06 — durable archiving is EXPLICIT opt-in (`VENDOR_SYNC_DURABLE_ARCHIVE`, default off): `uploadArchive` is best-effort/never-throws and uploads to a DEDICATED PRIVATE MinIO bucket (`VENDOR_SYNC_FEED_ARCHIVE_BUCKET`, default `vendor-feeds`) via the raw MinIO client — deliberately NOT the shared Medusa File/minio-file provider, whose only provider forces public-read on everything it stores. Needs full MinIO creds or it's a no-op.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

### WB-018 · Stock freshness bound to 12h run; no stock-only fast path   [MEDIUM]
- status: done
- area: backend/vendor-sync/jobs
- evidence: backend/src/jobs/vendor-sync-tick.ts:33-36
- problem: inventory levels are only updated as part of the full 12h catalog sync; there is no way to refresh stock counts more frequently without triggering a full diff-and-apply.
- fix: add a stock-only fast path (separate cron or manual trigger) that updates inventory_item quantities from the feed without re-diffing product/variant metadata.
- verify: a stock-only sync updates inventory levels without creating/modifying product or variant records; it can be run independently of the full 12h sync.
- done: 2026-07-06 — `service.runStockOnly` (`mode: "stock"`) fetches + stages then skips diff/applyChanges, applying only stock levels; a new cron `vendor-sync-stock-tick` (`VENDOR_SYNC_STOCK_CRON`, default `0 */3 * * *`) mirrors the full-sync tick. Full and stock runs keep independently-scoped delta short-circuits (each keyed by `mode`) so neither poisons the other's "nothing changed" skip; `source_modify_time` persists on both the changed and unchanged path for the stock chain to keep working across cycles.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

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
- status: done
- area: backend/vendor-sync/service
- evidence: backend/src/modules/vendor-sync/service.ts:56,84-94
- problem: the cooperative cancellation flag for vendor-sync runs is stored in-process memory; in worker-mode-split deployments (WORKER_MODE=worker), cancellation sent to the HTTP server process does not reach the worker process running the sync.
- fix: move the cancellation flag to a shared store (Redis key or DB column) so it is visible across processes.
- verify: sending a cancel request to the HTTP server while a sync runs in a separate worker process causes the worker to stop processing; the run transitions to cancelled.
- done: 2026-07-06 — cancellation is now DB-backed and cross-process: `vendor_feed_run.cancel_requested_at` (added by the foundation migration) replaces the in-process flag; `isCancelled` is async and reads the row, `markCancelled` persists the timestamp, and `finalizeApply` owns the `cancelled` status transition. `cancel_requested_at` resets to null on approve/replay re-entry so replaying a previously-cancelled run doesn't self-cancel.
- refs: [spec](../done/specs/2026-07-05-vendor-sync-productionization-design.md) · [plan](../done/plans/2026-07-05-vendor-sync-productionization.md)

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

---

### WB-063 · Tire fitment (car → OEM tire size → fitting tires)   [HIGH]
- status: done
- area: backend/wheel-size + storefront/tire-discovery + storefront/product-detail + storefront/garage
- evidence: backend/src/modules/wheel-size/{canonicalize-tire-size,oem-tire-sizes}.ts + types.ts (`VehicleFitment.oemTireSizes`) ; storefront/src/lib/fitment/{canonicalize-tire-size,tire-fits-vehicle}.ts ; storefront/src/modules/tire-discovery/{data/types,data/get-tire-products,data/cache-key}.ts + components/{fitment-sync,header,active-chips,grid/tire-fit-badge}.tsx ; storefront/src/modules/product-detail/components/tire/hero/{index,purchase-panel}.tsx
- problem: wheels have full fitment (pick a car → filter/badge wheels that fit) but tires had none — a shopper on `/tires` couldn't tell which tires match their vehicle.
- fix: **forward tire fitment, joining on the vehicle's factory (OEM) tire size** instead of bolt pattern, reusing the existing garage + wheel-size fitment cache. OEM tire sizes are extracted from the **already-cached** `by_model` raw (`extractOemTireSizes` reads `wheels[].front/rear.tire` where `is_stock===true`, canonicalized + flattened + deduped) — no new wheel-size API calls, no migration. `VehicleFitment.oemTireSizes` flows to the garage vehicle; a `?fit=<sizes CSV>` param (mirroring the wheel `?fit=`) drives a `tire_sizes IN [...]` Meili clause (reusing the SP2 facet), a `FitmentSync` auto-writer + "FITS YOUR CAR" header chip + `fit=0` "Show all" escape, per-card FITS badges, a tire-PDP "FITS YOUR {car}"/"MAY NOT FIT" chip, and a fit-aware default size. One pure `tireFitsVehicle` verdict drives badge + filter + PDP chip; a shared `canonicalizeTireSize` (drift-guarded by `fixtures/tire-size-canonical-golden.json`, asserted in both apps) normalizes the vehicle side to match the canonical product `tire_sizes`.
- verify: with a garage vehicle active, `/tires` auto-applies the OEM-size fit filter (header shows "FITS YOUR CAR", "Show all" escapes to `fit=0`), fitting tire cards show a FITS badge, and a fitting tire's PDP shows "FITS YOUR {car}" + defaults to a fitting size. **Gates met: backend `test:fitment` 66 pass / 1 skip (incl. new oem-tire-sizes + canonicalize-tire-size); storefront vitest 168 pass (31 files); tsc 0-new on the tire/fitment surface. Wheel fitment path unchanged (only additive optional `oemTireSizes`).** Subagent-driven (8 tasks + per-task spec+quality reviews + opus final review).
- notes: forward-only — the reverse "N vehicles this tire fits" list (the WB-009 analog) is deferred, along with aftermarket/plus-size/`/upsteps/` sizes (OEM-only) and staggered front/rear (flattened front+rear into one size set).
- refs: design [docs/done/specs/2026-07-03-tire-fitment-design.md](../done/specs/2026-07-03-tire-fitment-design.md) ; plan [docs/done/plans/2026-07-03-tire-fitment.md](../done/plans/2026-07-03-tire-fitment.md)

---

### WB-064 · Home page shows no tire content (wheels-only landing)   [MEDIUM]
- status: done
- area: storefront/home
- evidence: storefront/src/app/[countryCode]/(main)/page.tsx ; storefront/src/modules/home/components/shop-tires-row/index.tsx ; storefront/src/modules/home/data/get-home-tires.ts
- problem: the tire store is live (WB-005) with fitment (WB-063), but the home page was eight wheel-only sections — nothing on the landing page signalled that Wheel Builds also sells tires.
- fix: one new home section — a live "Shop Tires" rail of the newest 6 tires, placed directly after "New This Week". A throw-safe `getHomeTires(limit)` wraps the existing `getTireDiscoveryProducts` (`sort:"newest"`, `EMPTY_TIRE_FILTERS`); `ShopTiresRow` (async server component mirroring `new-drops-row`) renders the existing `TireProductCard` grid and degrades to `null` when empty. Reuses the WB-063 `TireFitBadge` for free (cards show "FITS" when a garage vehicle matches). No new facet/card/test; no backend change.
- verify: the home page renders a "Shop Tires" rail of real tire cards after the wheels rail, each linking to its tire PDP and "View all tires →" → `/tires`; with no tires indexed the section is absent (no empty shell). **Gate met: storefront tsc 0-new on the touched files; `/` compiles.** Subagent-driven (1 task + spec+quality review).
- notes: out of scope — promo banner, fit-filtering the rail itself, hero/trust/metadata copy changes, a curated tire-handles env list (the `getHomeTires` seam leaves room for it later).
- refs: design [docs/done/specs/2026-07-03-home-tire-rail-design.md](../done/specs/2026-07-03-home-tire-rail-design.md) ; plan [docs/done/plans/2026-07-03-home-tire-rail.md](../done/plans/2026-07-03-home-tire-rail.md)

---

### WB-065 · Tire PDP has no reverse "confirmed models" list   [MEDIUM]
- status: done
- area: backend/wheel-size + storefront/product-detail
- evidence: backend/src/modules/wheel-size/{reverse-tire-fitment,service,types}.ts + api/store/fitment/by-tire-product/route.ts ; storefront/src/lib/data/fitment.ts + modules/product-detail/{data/types,data/get-product,data/tire/map-tire-detail}.ts + components/tire/fitment.tsx + templates/tire-detail.tsx
- problem: the wheel PDP shows a "FITMENT · N CONFIRMED MODELS" list (WB-009), but the tire PDP had no reverse-fitment surface — a shopper couldn't see which vehicles a tire fits.
- fix: the tire analog of WB-009, keyed on **OEM tire size** instead of bolt pattern. Pure reverse over the cached `wheel_size_fitment` rows: `buildReverseTireFitment` matches cached vehicles whose `extractOemTireSizes(raw)` intersects the product's canonical `tire_sizes`, identity via the reused `extractVehicleIdentity` — `service.reverseTireFitment` + `GET /store/fitment/by-tire-product` (degrades to `{ vehicles: [] }`, never 503). The tire PDP loader populates `TireProductDetail.fitment`; a `TireFitment` section (mirrors the wheel `components/fitment/`, verdict via `tireFitsVehicle`) renders "N CONFIRMED MODELS" + the active-vehicle status band. No new wheel-size API calls, no migration.
- verify: a tire PDP shows a "CONFIRMED MODELS" list of vehicles that run that size from the factory + a fits/doesn't-fit band for the active garage vehicle; empty data degrades silently. **Gates met: backend `test:fitment` 71 pass / 1 skip (incl. new reverse-tire-fitment); storefront vitest 171 pass (32 files); tsc 0-new. Wheel PDP untouched.** Subagent-driven (3 tasks + per-task spec+quality reviews + opus final).
- notes: OEM-only (matches WB-063 forward); the dead "submit your build" `<a href="#">` from the wheel section is dropped, not reimplemented.
- refs: design [docs/done/specs/2026-07-03-tire-fitment-reach-design.md](../done/specs/2026-07-03-tire-fitment-reach-design.md) ; plan [docs/done/plans/2026-07-03-tire-fitment-reach.md](../done/plans/2026-07-03-tire-fitment-reach.md)

---

### WB-066 · Vehicle-picker funnel routes only to wheels   [MEDIUM]
- status: done
- area: storefront/search
- evidence: storefront/src/modules/search/components/search-drawer/find-by-vehicle/{destination-url,destination-toggle}.tsx + ymm-pane.tsx + garage-pane.tsx
- problem: every "find by vehicle" entry (YMM pane, garage pane) routed to `/store` (wheels). A shopper who picked their car always landed on wheels, never tires — even though `/tires` auto-applies the active vehicle's OEM-size fit.
- fix: a "Shop for: Wheels | Tires" segmented toggle (default Wheels) on both the YMM and garage panes, plus a pure `fitmentDestinationUrl({ countryCode, target, boltPatterns, oemTireSizes })` builder — Wheels → `/store?fit=<boltPatterns>` (unchanged), Tires → `/tires?fit=<oemTireSizes>` so the tire surface renders pre-fitted on first paint. The garage `update()` now also persists `oemTireSizes` so re-resolved older vehicles carry them. Every existing fitment-lookup + toast branch preserved; toggle state is local to the drawer (no persistence).
- verify: picking a car with "Tires" selected lands on `/tires` filtered to the vehicle's OEM sizes; "Wheels" behaves exactly as before. **Gate met: storefront vitest 171 pass (incl. new `fitmentDestinationUrl` cases); tsc 0-new.** Subagent-driven (2 tasks + per-task spec+quality reviews + opus final).
- notes: out of scope — hero-tile / popular-chip / trending tire paths (separate merchandising item); changing the wheel default; toggle persistence. **Superseded (2026-07-04): the visible toggle was REMOVED — routing is now page-aware (a car pick on a wheel page fits wheels, on a tire page fits tires) driven by a `fitment-context` surface store; the wheel-flavored toast + the standalone Shop-Tires rail were also fixed/replaced (see WB-067 + the fixes below).**
- refs: design [docs/done/specs/2026-07-03-tire-fitment-reach-design.md](../done/specs/2026-07-03-tire-fitment-reach-design.md) ; plan [docs/done/plans/2026-07-03-tire-fitment-reach.md](../done/plans/2026-07-03-tire-fitment-reach.md)

---

### WB-067 · Tire fitment broken for logged-in users (garage drops OEM tire sizes)   [HIGH]
- status: done
- area: backend/customer-vehicle + storefront/garage
- evidence: backend/src/modules/customer-vehicle/models/customer-vehicle.ts (`oem_tire_sizes` col) + service/validators/[id] route ; storefront/src/lib/garage/medusa-garage.ts (toWire/fromWire/update)
- problem: WB-063 added `oemTireSizes` to the storefront + the guest (localStorage) path only. The authed `customer_vehicle` table + `medusa-garage` serialization stored every fitment field EXCEPT `oemTireSizes`, so a logged-in vehicle round-tripped through the backend without tire sizes — wheels fit (bolt patterns persist), tires never did (`TireFitmentSync` saw no sizes → wrote no `?fit`, `/tires` stayed unfiltered). Live-verified via the network trace (URL stayed `/us/tires`).
- fix: an additive nullable `oem_tire_sizes` json column (+ `Migration20260704120000`, run on prod) threaded through the service / `VehicleCreateSchema` / `[id]` update route + serialized in `medusa-garage` `toWire`/`fromWire`/`update`. Also (same session): the tire-PDP misroute fix (PDP loader now fetches `product.metadata` so tires render the tire template — was blank image + zeroed specs), nav active-state from pathname, hero "Find My Fit" CTA carries the fit, page-aware routing (toggle removed), a bold home TIRES band, page-aware "no fitment" toast, garage OEM-size backfill on re-select, and tire-PDP fit-mode size filtering (WB-060 parity).
- verify: a logged-in vehicle's tire sizes persist; `/tires` auto-applies `?fit=<oem sizes>` and filters; tire PDPs render (image + specs) + hide non-fitting sizes with a "Show all" escape. **Gates met: backend test:fitment 66→ + customer-vehicle green; storefront tsc 0-new + vitest.** Direct + subagent-driven fixes.
- notes: needs a backend redeploy (metadata fetch + serialization) + storefront rebuild. The wheel-size migration this session ALSO ran the long-pending WB-007 bore migration + G4 newsletter table (they'd never run on prod — init-backend skipped migrations on the already-seeded DB).
- refs: design [docs/done/specs/2026-07-04-tire-fitment-fixes-and-home-balance-design.md](../done/specs/2026-07-04-tire-fitment-fixes-and-home-balance-design.md)

---

### WB-068 · Tire fitment is single-axis (size only), unlike wheels   [MEDIUM]
- status: done
- area: backend/wheel-size + backend/search + backend/customer-vehicle + storefront/tire-discovery + storefront/product-detail
- evidence: backend `speed-rating-rank.ts` + `oem-tires.ts` + `reverse-tire-fitment.ts` + `build-search-document.ts` (`fit_specs`) + `customer_vehicle.oem_tires` ; storefront `lib/fitment/{speed-rating-rank,tire-fits-vehicle}.ts` + `tire-discovery/data/{types,get-tire-products,cache-key}.ts` + `components/fitment-sync` + the tire PDP/badge consumers
- problem: tires matched on canonical SIZE only, so one tire matched many unrelated cars — the owner wanted the wheel-style multi-axis rigor. (Tires have no bolt-pattern/offset/bore analog — a tire mounts on the wheel, not the hub.)
- fix: the one legitimate extension — **load index + speed rating (meet-or-exceed)**. A tire fits when a variant matches an OEM size AND `loadIndex ≥` OEM AND `speedRatingRank ≥` OEM (missing data on either side passes). A shared `speedRatingRank` (golden-guarded, `H` between `U`/`V`); backend `extractOemTires`→`VehicleFitment.oemTires`, multi-axis reverse, per-variant `fit_specs` in the Meili doc, a `customer_vehicle.oem_tires` column; storefront one multi-axis `tireFitsVehicle(productSpecs, oemTires)` drives badge + PDP chip + PDP fit-mode filter + reverse, and `/tires` fit mode post-filters the size-matched candidates over `fit_specs` (no Store-API round-trip — lighter than the wheel WB-060). No new API/quota.
- verify: a logged-in vehicle whose OEM speed exceeds a low-rated tire drops that tire from `/tires ?fit`, its card loses the FITS badge, and its PDP reads "MAY NOT FIT". **Gates met: backend test:fitment 81 (serial) + test:sync green; storefront tsc 0-new (baseline 14) + vitest 200.** Subagent-driven (10 tasks + per-task spec+quality reviews + opus final). **Needs the `oem_tires` migration (run 2026-07-04) + a Meili re-sync/backend restart for `fit_specs` (post-filter treats empty fit_specs as PASS pre-resync).**
- notes: out of scope — plus-sizing; staggered front/rear (flattened); exact-match load/speed (meet-or-exceed is the correct rule). Load/speed adds rigor but doesn't much reduce cross-car breadth (that's from standardized sizing — inherent).
- follow-up (2026-07-04, merged + pushed to `main`): post-merge polish from live testing — (1) both tire-PDP fit surfaces (the hero purchase chip AND the "Does it fit your ride?" band) now reflect the SELECTED size, not "does any size fit", so "Show all" + a non-OEM pick honestly flips both to "MAY NOT FIT" (wheel WB-056 parity; the band reads the selection via a new zero-dependency `storefront/src/lib/stores/selected-tire-fit.ts` `useSyncExternalStore` bridge the hero publishes to); (2) the tire store + tire PDP were brought to line-for-line VISUAL parity with the wheel surfaces (chrome only — tire data preserved: Vehicle band + fit-aware empty state on the rail, FITS badge back in the card corner, hero re-order to purchase-panel-above-picker, `wheel-glow`, bold stat tiles + tooltips, voiced specs title, fitment footer note). Commits `3257b64`/`3f7e573`/`3feee8b`; storefront tsc 14-baseline + vitest 200.
- refs: design [docs/done/specs/2026-07-04-multi-axis-tire-fitment-design.md](../done/specs/2026-07-04-multi-axis-tire-fitment-design.md) ; plan [docs/done/plans/2026-07-04-multi-axis-tire-fitment.md](../done/plans/2026-07-04-multi-axis-tire-fitment.md)

---

### WB-069 · Audit remediation umbrella — 76 findings from the 2026-07-06 done-specs audit   [HIGH]
- status: DONE — all 6 remediation clusters shipped + merged to `main` (2026-07-06 → 2026-07-08). WB-070 sync-lifecycle-integrity, WB-071 checkout-money-honesty, WB-072 fitment-truth, WB-073 garage-session-integrity, WB-074 discovery-honest-signals, WB-075 docs-truth-sweep — each re-verified vs current main first, per-task spec+quality review + fix loops, opus whole-branch review per cluster. Non-blocking follow-ups are recorded per-cluster (below) for a future pass; the epic itself (turn every audit finding into a fix / refute / doc-correction) is complete.
- area: backend/vendor-sync + backend/wheel-size + storefront (discovery/pdp/checkout/garage) + docs
- evidence: docs/future/plans/2026-07-06-audit-remediation-theme.md:1
- problem: a 27-reviewer audit of every done spec/plan (24 units + 6 business-logic domains; 116 raw → 76 unique after dedup vs this backlog) found 76 previously-untracked problems. 9 are CONFIRMED (unanimous 3-lens adversarial panels) and ALL are high-severity vendor-sync lifecycle bugs — phantom warehouse stock after per-warehouse sellouts (oversell), discontinued-reappear products stuck DRAFT forever, zombie null-variant state rows that wedge groups, re-listed variants keeping stale prices, stock-pass errors invisible to retry, price changes never re-indexed in Meili, dry-run blocking the next real sync, stale-approval catalog rollback, no concurrency guard on approve/replay. 47 findings (incl. placeOrder swallowing completion errors after card auth, Manual Payment `pp_system_default` selectable in production, fitment cache-key year drops, authed hub-bore INTEGER truncation) are single-reviewer claims awaiting verification.
- fix: work the theme doc's six clusters, each as its own spec+plan (docs/in-progress/) with its own WB id: sync-lifecycle-integrity (the 9 confirmed, first), fitment-truth, checkout-money-honesty, garage-session-integrity, discovery-honest-signals, docs-truth-sweep. Finish verification of the 47 pending findings (resume workflow wf_7e98d308-058 with cached replay, or spot-verify per cluster at spec time). NOTE: finder passes span 2026-07-04→06 snapshots; G1 + WB-063..068 merged mid-audit — re-check pending findings against current main.
- verify: every finding in the four log docs is either (a) fixed via a merged cluster plan, (b) refuted with recorded reasoning, or (c) explicitly wont-fix'd; the 9 confirmed vendor-sync bugs have regression tests.
- refs: theme [docs/future/plans/2026-07-06-audit-remediation-theme.md](plans/2026-07-06-audit-remediation-theme.md) ; logs [vendor-sync](plans/2026-07-06-audit-findings-vendor-sync.md) · [fitment-garage](plans/2026-07-06-audit-findings-fitment-garage.md) · [storefront](plans/2026-07-06-audit-findings-storefront.md) · [ops-docs](plans/2026-07-06-audit-findings-ops-docs.md)

---

### WB-070 · sync-lifecycle-integrity — the 9 confirmed vendor-sync bugs (+ folded #11/#16)   [HIGH]
- status: DONE + merged to `main` 2026-07-06 (SDD: 10 tasks + final-fix pass, per-task spec+quality review + opus whole-branch review "Ready to merge: Yes"; 2 review fast-follows fixed). Gates: test:sync 312 pass, tsc baseline-only, medusa build exit 0.
- area: backend/vendor-sync (pipeline/apply, apply-stock, finalize-apply, service, utils/hash, lifecycle-guards) + admin routes/console
- evidence: docs/done/specs/2026-07-06-sync-lifecycle-integrity-design.md:1
- problem: G9 cluster 1. The 9 CONFIRMED (unanimous) vendor-sync lifecycle findings, all HIGH, all instances of "persisted state silently diverges from the feed while the run reports success": (1) changed path overwrites `normalized` before the stock pass → per-warehouse sellouts never zeroed (oversell); (2) re-listed discontinued group adopted but never republished → stays DRAFT forever; (3) adoption writes null-variant current rows with a settled hash → zombie SKUs wedge groups; (4) re-listed removed variant keeps `discontinued:true` + stale price; (5) stock-pass errors invisible to finalize/retry + hash advances before stock; (6) price/variant changes never emit `product.updated` → Meili stale; (7) dry-run finishes `completed` `mode:"full"` → skips the next real sync; (8) approving a stale awaiting_approval run rolls the catalog back + parked runs pile up; (9) no vendor concurrency guard on approve/replay. Folded pending mediums: #11 (hash array-replacer serializes `stockByWarehouse` as `{}`), #16 (approveAndApply never re-reads status).
- fix: four root-cause groups — A stock phase authoritative+honest (location-based zero-out; stock pass owns the settled `content_hash` + surfaces errors; hash counts per-warehouse stock), B adoption/re-listing tells the truth (republish + `refreshReListedVariants`; no zombie rows), C emit `product.updated` after variant-only mutations, D lifecycle guards (`mode:"dry"`; `awaiting_approval` blocking + explicit vendor lock + supersede/re-validate on approve/replay). Decisions: root stock fix, block+lock, fold #11/#16 (user, 2026-07-06).
- verify: `pnpm test:sync` extended with pure-logic cases (zero-out, hash warehouse-sensitivity, isVendorBusy/isRunSuperseded); `tsc` baseline-only; `medusa build` exit 0. I/O paths via review + staged Railway dry-run. NOTE: A3 hash change → first post-deploy full sync re-applies the whole catalog once (idempotent).
- refs: spec [docs/done/specs/2026-07-06-sync-lifecycle-integrity-design.md](../done/specs/2026-07-06-sync-lifecycle-integrity-design.md) ; plan [docs/done/plans/2026-07-06-sync-lifecycle-integrity.md](../done/plans/2026-07-06-sync-lifecycle-integrity.md) ; umbrella WB-069 ; findings [vendor-sync #1-9,11,16](plans/2026-07-06-audit-findings-vendor-sync.md)

---

### WB-071 · checkout-money-honesty — 9 audit findings (F-A…F-I)   [HIGH]
- status: DONE + merged to `main` 2026-07-06 (SDD: 11 tasks + a final-fix pass, per-task spec+quality review + opus whole-branch review "Ready to merge: With fixes" — the one fix-before-merge applied). Gates: storefront vitest 209 + tsc baseline-only, backend test:sync 312 + medusa build exit 0. (`build:next` deferred — needs a live backend.)
- area: storefront (checkout, PDP/discovery/home pricing, middleware, cart data) + backend (region config, seed shipping, 2 ops scripts)
- evidence: docs/done/specs/2026-07-06-checkout-money-honesty-design.md:1
- problem: G9 cluster 2. Customer-facing money-honesty: F-A Manual Payment (`pp_system_default`) selectable in prod → unpaid orders; F-B checkout total rounds then fakes `.00`; F-C `placeOrder` swallows completion errors after card auth (silent dead end); F-D PDP/featured default-region pricing vs route-region cart; F-E payment-switch charges the old provider; F-F apartment/unit stripped at checkout; F-G promo errors fail silently; F-H "free shipping $199+" promised but flat $10 charged; F-I ~10 price displays round to whole dollars.
- fix: exact-cent `formatCentsUsd` sweep (F-B/F-I); hide Manual from customers in prod + region wires Stripe when configured + guarded `strip-manual-payment.ts` + prod-neutralized Manual button (F-A); `placeOrder` throws on non-order completion (F-C); real Medusa v2 conditional shipping price $0≥$199 + `update-shipping-prices.ts` + aligned copy (F-H); single-region US lock + route-region PDP/featured pricing (F-D); payment re-init + pending-session dispatch (F-E); `address_2` through checkout (F-F); promo-diff error surface (F-G).
- follow-ups (whole-branch review Minors, non-blocking): DRY the checkout-summary 2-decimal literal into a shared dollar helper; `strip-manual-payment.ts` set-exact → targeted-remove comment; drop `(cartRes as any)` in placeOrder; wrap `addPromotionCode` await in try/finally; delete now-dead `submitPromotionForm` in `lib/data/cart.ts`; consider a returned-value pattern for `placeOrder` so F-C copy isn't redacted by Next in prod.
- deploy: run `strip-manual-payment.ts` (F-A) and — after a dev-DB dry run — `update-shipping-prices.ts` (F-H) against prod, both `--confirm-host`-guarded. Staging smoke: $150→$10 / $250→$0 shipping; prod checkout shows no Manual; F-C failure copy.
- verify: vitest 209 (formatCentsUsd, filterCustomerPaymentMethods, promoApplied) ; tsc baseline ; backend build/test:sync green.
- refs: spec [docs/done/specs/2026-07-06-checkout-money-honesty-design.md](../done/specs/2026-07-06-checkout-money-honesty-design.md) ; plan [docs/done/plans/2026-07-06-checkout-money-honesty.md](../done/plans/2026-07-06-checkout-money-honesty.md) ; umbrella WB-069 ; findings [storefront #4,5,8,14,15,16,17,21](plans/2026-07-06-audit-findings-storefront.md) + [vendor-sync #10](plans/2026-07-06-audit-findings-vendor-sync.md)

---

### WB-072 · fitment-truth — 17 findings (backend B1–B8 + storefront S1–S9)   [HIGH]
- status: DONE + merged to `main` 2026-07-07 (SDD: 14 tasks + 2 review fixes, per-task spec+quality review + opus whole-branch review "Ready to merge: With fixes" — the one Important fixed). All 17 re-verified vs current main first (2 parallel verifiers; all held). Gates: backend test:fitment 98 + test:sync 312 + medusa build 0; storefront vitest 214 + tsc baseline-only.
- area: backend/wheel-size (cache-key, quota, catalog, reverse-fitment, atomic upsert) + backend/customer-vehicle (hub-bore migration + backfill) + storefront (fits-vehicle, fit-view, fitment PDP band/list, discovery fit-badge)
- evidence: docs/done/specs/2026-07-06-fitment-truth-design.md:1
- problem: G9 cluster 3. Fitment answered from wrong/stale/quota-dishonest data AND over/under-claiming UI. Backend: cache key dropped the YEAR when a trim slug was present (wrong-generation fitment 90d, B1); `customer_vehicle.hub_bore_mm` INTEGER truncated the bore gate (B2); quota exhaustion cached as durable false not_found (B4); catalog reads bypassed the quota counter + never expired + 500'd (B5/B6); vehicle-update route unvalidated (B7); non-atomic upsert race (B8); warm-cron trim-key failure loop (B3). Storefront: `fitsVehicle` per-dimension over-claim (S1); confirmed-models list bolt+bore-only vs the size-hardened band (S2); fit mode never trimmed/defaulted the offset axis (S3); fit-view decoupled bore from offset per variant (S4); no-fitment-data shown as "doesn't fit" not unknown (S5); discovery FITS badge bolt-only over-claim (S6); "bench-verified" copy + dead CTA (S7); duplicate offset chips (S8); YOUR VEHICLE make/model-only highlight (S9).
- fix: year always in the cache key (B1/B3); hub-bore `hub_bore_mm_x100` migration + writers/reader + guarded `backfill-garage-bore.ts` re-resolve (B2); quota-out throws 503 uncached but region-probe keeps an already-found result (B4); catalog quota-count + SWR TTL + validate + 503 (B5/B6); `parseVehicleUpdate` (B7); atomic ON CONFLICT upsert (B8). Per-variant conjunction + `unknown` verdict in `fitsVehicle` (S1/S5); reverse-fitment size-window gate via aligned CSV tuples (S2); fit-view bore+offset paired per variant + offset trim/fit-aware default (S3/S4); FITS badge only in fit-mode (S6); honest copy + removed dead CTA (S7); compound offset-chip key + bore-disambiguated selection (S8); year-range+trim highlight match (S9). Review fix: the PDP "Fits your X" band now derives fit from per-variant `buildFitView().hasFit` so band ≡ hero on the bore axis.
- follow-ups (whole-branch review + per-task minors, non-blocking): add hub-bore x100 round-trip unit test (B2, safety, cheap); extract+test `yearMatches`/`trimMatches` (S9); `parseVehicleUpdate` test (B7); stronger cross-mixed reverse test (S2); FitBadge render test (S6); dedupe `isValidParam` across catalog routes (B5); remove dead `!withinWindow` sub-branch in fitment/index.tsx (S1); neutral `unknown` state on the PDP chip (S5 half-thread, currently safe); verify `take: null` in the backfill; catalog SWR treats any non-2xx as outage (harmless); panel `current` var still offset-only (inert); tire `fitment.tsx` shares the dead-CTA pattern (tire follow-up).
- deploy: A1 cache re-key orphans old `wheel_size_fitment` rows (self-heal on next lookup; optionally truncate to force a clean re-warm); A2 migration auto-runs on `db:migrate`, then run the guarded `backfill-garage-bore.ts` against prod to recover true bore for existing garage vehicles. No new required env.
- verify: backend test:fitment 98 + test:sync 312 + medusa build 0; storefront vitest 214 + tsc baseline-only.
- refs: spec [docs/done/specs/2026-07-06-fitment-truth-design.md](../done/specs/2026-07-06-fitment-truth-design.md) ; plan [docs/done/plans/2026-07-06-fitment-truth.md](../done/plans/2026-07-06-fitment-truth.md) ; umbrella WB-069 ; findings [fitment-garage #1,2,6,7,8,9,10,11,12,19,20,21,22,23,26](plans/2026-07-06-audit-findings-fitment-garage.md) + [storefront #1](plans/2026-07-06-audit-findings-storefront.md)

---

### WB-073 · garage-session-integrity — 10 findings (G1–G10)   [HIGH]
- status: DONE + merged to `main` 2026-07-07 (SDD: 9 finding-tasks + 1 gate task, per-task spec+quality review with fix loops + opus whole-branch review "MERGE-READY: no Critical, no Important"). All 10 re-verified vs current main first (all held). Gates: storefront vitest 270 + tsc 14-baseline; backend test:fitment 109 + test:sync 312 + medusa build 0.
- area: storefront/lib/garage (`RoutingGarage` identity+generation lifecycle, `MedusaGarage`/`LocalStorageGarage`, `use-garage`) + storefront search find-by-vehicle panes + discovery `fitment-sync` + layout `garage-pill` + account garage + backend/customer-vehicle (atomic activate) + vehicles validators
- evidence: docs/done/specs/2026-07-07-garage-session-integrity-design.md:1
- problem: G9 cluster 4. The garage abstraction treated "authed" as a boolean not a customer identity, and every authed write was fire-and-forget: G1 components go stale after an auth swap; G2 logout→login-as-another leaks the prior customer's garage; G3 unordered authed add (activate/update hit a not-yet-created vehicle, 404 swallowed); G4 non-atomic activate races the one-active unique index (500); G5 silent `.catch(()=>{})` write failures; G6 failed initial load renders an empty garage (looks like data loss); G7 merge TOCTOU wipes a vehicle added mid-merge; G8 unhandled non-503 fitment error stalls the drawer with a half-added vehicle; G9 unbounded merge/create batch; G10 orphaned `?fit` after the last vehicle is removed.
- fix: identity+monotonic-generation lifecycle — rebuild `remote` on customer change, re-point listeners, guard overlapping `syncAuth`, gate `local.clear` behind the generation (G1/G2); `pendingCreate` sequences create→activate→update (G3); atomic customer-scoped data-modifying CTE + 23505 retry-once + honest NOT_FOUND (G4); `onGarageError`→sonner toast + per-op rollback + `failedCreateIds` + `superseded` gate (G5); `isLoaded()`/`loadError()`/`retryLoad()` + a `loading` flag (init-true, `gen===1` first-probe, cleared on any current-gen settle) + 3-state GarageManager (G6); full pre-merge snapshot clear + bounded 3-round generation-guarded drain so window-adds sync not vanish (G7); `resolveFitmentForVehicle` discriminated result, both panes handle unavailable/failed + non-throwing `update` (G8); `VehicleMergeSchema.vehicles.max(50)` (G9); `shouldStripFit` gated on `isLoaded` + GaragePill gated (G10).
- follow-ups (whole-branch review, non-blocking): FU1 route `deleteVehicle` behind `pendingCreate` (add-then-quick-remove now toasts + rolls back a legit remove); FU2 apply the G10 orphaned-`?fit` strip to tire discovery (wheel-only today); FU3 staging 2-session psql concurrency check on the atomic-activate CTE; minor style dups (pendingCreate/active-fallback), T2a emit-before-set 1-line hardening.
- deploy: no migration, no new env (the `UQ_customer_vehicle_one_active` index already exists; the atomic activate changes only the query). All storefront fixes are client-lib/component.
- verify: storefront vitest 270 + tsc baseline-only; backend test:fitment 109 + test:sync 312 + medusa build 0.
- refs: spec [docs/done/specs/2026-07-07-garage-session-integrity-design.md](../done/specs/2026-07-07-garage-session-integrity-design.md) ; plan [docs/done/plans/2026-07-07-garage-session-integrity.md](../done/plans/2026-07-07-garage-session-integrity.md) ; umbrella WB-069 ; findings [fitment-garage #3,4,5,13,14,15,16,17,24,25](plans/2026-07-06-audit-findings-fitment-garage.md)

---

### WB-074 · discovery-honest-signals — 8 findings (D1–D8)   [MED]
- status: DONE + merged to `main` 2026-07-08 (SDD: 5 finding-tasks + a final-review fix, per-task spec+quality review with fix loops + opus whole-branch review "MERGE-READY"). All 8 re-verified vs current main first (all held; the tire twin had already fixed its D1). Storefront-only. Gate: vitest 316 + tsc 14-baseline.
- area: storefront/discovery (`get-products.ts` fit branch, `product-card.tsx`, discovery header + mobile filter trigger) + product-detail/home card mappers (`get-product.ts` getRelatedProducts, `get-featured.ts`, `finish-options.ts`) + home (`page.tsx` metadata, `new-drops-row`, `featured-blocks`)
- evidence: docs/done/specs/2026-07-07-discovery-honest-signals-design.md:1
- problem: G9 cluster 5. Discovery/home surfaced counts, tags + "fits" claims stronger than the data: D1 fit-mode facet counts collapsed each multi-valued product to its FIRST diameter/bolt-pattern; D2 fit mode silently truncated at 200 candidates + `totalCount`/pagination lied; D3 fit-mode facets non-disjunctive; D4 a Store-API failure CACHED an over-claiming "these fit" list 60s; D5 home SEO metadata "Authorized dealer for 0 brands" when Meili down; D6 related+featured cards read the RETIRED `product.metadata.finish` → every card black since WB-059; D7 the WB-048 `"BLANK"` placeholder leaked as a bolt pattern onto cards (incl. the flagship grid); D8 the "New Drops" row showed a hardcoded `"08"` counter.
- fix: `facetsFromHits` tallies every value from raw hits like the tire twin (D1); `isCapped = estimatedTotalHits > FIT_CANDIDATE_CAP` → honest "top 200 candidates" header + mobile label + bounded pagination (D2); D3 took the SPEC-SANCTIONED fallback (in-memory disjunctive is impossible — the single Meili query already applies every sidebar filter — so correct D1 counts + `TODO(D3)`); rethrow on Store-API failure → escapes `unstable_cache` → honest uncached empty, + mandatory per-variant verification kills the non-throw empty-response over-claim too (D4); `homeMetaDescription` drops the numeral when `brandCount` falsy (D5); card `finishes` derive from the VARIANT-metadata union, omit-not-black on empty (D6); `isRealBoltPattern` at all card sites incl. `hitToProduct` for the flagship grid (D7); New-Drops counter = real `drops.length` (D8).
- follow-ups (whole-branch review, non-blocking): backend `build-search-document.ts:72-74` should filter `"BLANK"` from the Meili `bolt_patterns` index (root cause; + re-sync); optional user-visible non-disjunctive caveat in the filter rail (D3); the tire twin `get-tire-products.ts` shares the D3 gap + has stale `facetsFromProducts` comments; device-verify the mobile cap-label length.
- deploy: storefront-only, no migration/env. D4 changes degradation (a transient Store-API blip → honest empty vs a cached over-claim). NEEDS a storefront rebuild.
- verify: storefront vitest 316 + tsc 14-baseline (no backend changes).
- refs: spec [docs/done/specs/2026-07-07-discovery-honest-signals-design.md](../done/specs/2026-07-07-discovery-honest-signals-design.md) ; plan [docs/done/plans/2026-07-07-discovery-honest-signals.md](../done/plans/2026-07-07-discovery-honest-signals.md) ; umbrella WB-069 ; findings [storefront #3,9,11,12,13,18,22 + home-merch](plans/2026-07-06-audit-findings-storefront.md)

---

### WB-075 · docs-truth-sweep — 5 DOC findings + doc-drift sweep (closes the G9 epic)   [LOW]
- status: DONE + merged to `main` 2026-07-08 (SDD: 6 substantive tasks + epic-close, per-task review with fix loops — DOC4 failed review once + was corrected — + opus whole-branch review "MERGE-READY, OK to close the epic"). Ran LAST so it re-baselines the tsc/test counts the earlier clusters shifted. Gate: backend test:sync 312 + test:fitment 109 + test:newsletter 8 + test:admin 7 + test:config 16 (452) + medusa build 0; storefront vitest 312 + tsc 12-baseline.
- area: storefront (delete dead resolve-variant) + backend (newsletter service+route, module-status) + `.env.template` + `docs/done/specs` + `docs/STATUS.md` + `README.md` + `storefront/CLAUDE.md`
- evidence: docs/done/specs/2026-07-07-docs-truth-sweep-design.md:1
- problem: G9 cluster 6 — docs + two code paths describing a repo that no longer exists. DOC1 `resolveSelectedVariant` dead code kept green by its own test (+2 of the 14 tsc baseline errors); DOC2 newsletter subscribe non-atomic list-then-create → concurrent dup 500s (breaks "always 201"); DOC3 `.env.template` promised a `MEILISEARCH_MASTER_KEY` fallback no code implements; DOC4 `module-status.ts` trimmed env values while `medusa-config.js` uses raw truthiness → a whitespace-only value registers but logs DISABLED; DOC5 the done fitment-aware-PDP spec described `hasFit:false`→"show everything"+a `defaults` object that WB-072 inverted; DRIFT: `STATUS.md` Tests block + `README.md` (checkout/tires/admin/reverse-fitment/catalog size) + `storefront/CLAUDE.md` baseline-error list all stale.
- fix: deleted `resolve-variant.ts`+test → tsc baseline 14→12 (DOC1); rewrote `subscribe()` as an atomic 3-CTE `knex_.raw` upsert (`target_deleted→reactivated→inserted` + `ON CONFLICT ("email") WHERE deleted_at IS NULL DO NOTHING`) with soft-delete reactivation + route always-201 (DOC2); corrected the `.env.template` Meili comment (no master-key fallback) (DOC3); `module-status.has()` = `Boolean(env[k])` mirrors config truthiness for every case incl. `""`→disabled (DOC4); dated "superseded by WB-072" addendum on the done spec, history intact (DOC5); re-measured all counts + corrected STATUS/README/`storefront/CLAUDE.md` (DRIFT).
- follow-ups (whole-branch review, non-blocking): `module-status.ts` SendGrid/Resend rows gate on `has(*_FROM_EMAIL)||has(*_FROM)` but config reads only `API_KEY && *_FROM_EMAIL` (+ `.env.template` `SENDGRID_FROM` vs config `SENDGRID_FROM_EMAIL`) — same log-lies-about-config class, different axis; README "[ ] Pre-deploy hardening pass" checkbox reframe; newsletter concurrency proven by reasoning + a JS stub (no live PG in Jest) — folds into WB-073's staging psql check.
- deploy: no migration/env. DOC2 uses the EXISTING newsletter partial unique index; DOC4 changes only startup LOG output. Backend redeploy picks up DOC2/DOC4.
- verify: backend test:sync 312 / test:fitment 109 / test:newsletter 8 / test:admin 7 / test:config 16 + medusa build 0; storefront vitest 312 / tsc 12-baseline.
- refs: spec [docs/done/specs/2026-07-07-docs-truth-sweep-design.md](../done/specs/2026-07-07-docs-truth-sweep-design.md) ; plan [docs/done/plans/2026-07-07-docs-truth-sweep.md](../done/plans/2026-07-07-docs-truth-sweep.md) ; umbrella WB-069 ; findings [ops-docs #1-5 + drift](plans/2026-07-06-audit-findings-ops-docs.md)

### WB-076 · retire the garage — single cached vehicle (client decision)   [MED]
- status: done (2026-07-09, merged to `main`; live-smoked: YMM pick → `/store?fit` filter → replace → CLEAR → `/account/garage` not-found → backend routes 410)
- area: storefront `lib/garage` + drawer/nav/hero/account/checkout chrome; backend `medusa-config.js` + `src/api/store/customer/vehicles`
- evidence: storefront/src/lib/garage/single-vehicle-garage.ts:14 (SingleVehicleGarage), storefront/src/lib/garage/index.ts:16 (singleton swap), backend/medusa-config.js (module unregistered)
- problem: the client reports shoppers never make accounts — they pick their car in guest mode — so the account-backed garage (DB sync, login merge, account Garage tab, multi-vehicle list) is unused weight.
- fix: keep exactly ONE active vehicle in the browser localStorage cache (`SingleVehicleGarage extends LocalStorageGarage`, `add()` replaces; same `garage:*` keys so live actives survived), identical for guests + logged-in; fitment surfaces unchanged (they read `active` via `useGarage()`). Everything garage is mothballed, NOT deleted — grep `GARAGE-DISABLED`: `RoutingGarage` → `routing-garage.ts` (out of the app graph, still compiled + unit-tested), `medusa-garage`/`merge`/`garage-auth-sync`/`customer-vehicles` data layer disconnected, drawer garage pane + tabs collapsed to YMM + a "Current vehicle · CLEAR" row, pill reads "Vehicle · …", hero CTA "SELECT/CHANGE VEHICLE", account Garage nav+route disabled (404), backend `customer-vehicle` module unregistered + store routes 410 stubs (DB tables intact). Restoration recipe in the spec.
- verify: storefront vitest 317 (51 files, +5 `single-vehicle-garage`) / tsc 5-baseline / `build:next` clean; backend test:fitment 109 + test:config 16 + test:sync 312 + test:newsletter 8 + `medusa build` clean; Playwright live smoke PASS (incl. legacy 3-vehicle cache collapsing to 1 on next pick).
- refs: spec [docs/done/specs/2026-07-09-retire-garage-single-vehicle-design.md](../done/specs/2026-07-09-retire-garage-single-vehicle-design.md) ; plan [docs/done/plans/2026-07-09-retire-garage-single-vehicle.md](../done/plans/2026-07-09-retire-garage-single-vehicle.md)

### WB-077 · Fitment truth v2 — three-tier verdict + window integrity (false negatives)   [HIGH]
- status: done
- area: backend `wheel-size/normalize.ts` + `cache-key.ts` + `reverse-fitment.ts`; storefront `lib/fitment/*` + PDP/discovery fit surfaces
- evidence: backend/src/modules/wheel-size/normalize.ts:25 (`data[0]` only), :46 (`is_stock === false` only); storefront/src/lib/fitment/fits-vehicle.ts:71 (window-miss = hard no-fit), :45 (knife-edge bore), :40 (empty product patterns → false "bolt pattern does not match")
- problem: user-confirmed false negatives — wheels that fit in real life read "doesn't fit". Windows come from ONE arbitrary trim ("Any trim" default), exclude factory/stock sizes (an OE-replica reads no-fit), and outside-window renders as disproven instead of "aggressive — verify"; plus 0.1mm bore data noise → no-fit, and BLANK-pattern products claim a pattern mismatch. Repro'd with 9 unit-test scenarios 2026-07-10.
- fix: `normalizeByModel` merges ALL `data[]` trims (pattern union, window min/max incl. stock rims, bore null-on-disagreement) + cache-key v2 re-warm; a shared `FitTier` (`fits`/`check`/`no-fit`/`unknown`) with `check` = bolt+bore pass but out-of-window ("Aggressive fitment — verify clearance"), bore tolerance 0.2mm (golden-guarded), symmetric `unknown` for pattern-less products; discovery fit-mode includes + badges `check` (decision D1), reverse list stays strict.
- verify: the 9 audit scenarios re-added asserting FIXED behavior (20x10 ET-19 Silverado → `check` + visible in fit mode; OE-replica → `fits`; trim-order flip → same verdict); backend test:fitment + storefront vitest green
- done: 2026-07-10 — merged to `main` (merge `39c273a`, branch `feat/fitment-truth-v2`, 13 commits). SDD-executed (10 tasks, per-task spec+quality review + fix loops) + opus whole-branch review (caught 3 integration issues — PDP `?fit=1` hero over-claim, checkout-card metadata hydration, cache-key v2 warm-orphan quota treadmill — all fixed + re-verified). Decisions D1 (include+badge) & D4 (reset-email button) resolved as defaults. Gate: backend wheel-size+warm jest 106 pass/1 skip; storefront vitest 337/337; tsc baselines held (backend 1 = B11, storefront 5). **Deploy (pending): backend-first → MANDATORY `wheel_size_fitment` truncate (orphaned v1 rows) → storefront rebuild; no migration. Deferred live smoke: Silverado 20x10 ET-19 → CHECK FIT / OE-size → FITS / 5x114.3-only → DOESN'T FIT + confirm checkout "FITMENT CHECKED" card renders.** Plan [docs/done/plans/2026-07-10-fitment-truth-v2.md](../done/plans/2026-07-10-fitment-truth-v2.md) (→ move to done/ in WB-083 sweep).
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §1 ; findings [docs/future/plans/2026-07-10-launch-readiness-audit.md](plans/2026-07-10-launch-readiness-audit.md) §1

### WB-078 · Transactional email + account recovery (no emails send; no password reset exists)   [HIGH]
- status: done
- area: backend `email-notifications` templates + subscribers; storefront account/auth pages
- evidence: backend/src/subscribers/order-placed.ts:24 (`replyTo info@example.com`); templates/index.tsx (only 2 templates); storefront/src/modules/account/components/profile-password/index.tsx:19 (no-op form); zero reset/forgot matches repo-wide
- problem: prod sends NO emails (Resend env unset + missing from .env.template); no shipping confirmation; no password-reset flow anywhere (forgotten password = permanent lockout); change-password form does nothing; invite email says "Medusa".
- fix: set + template-document `RESEND_*`; `EMAIL_REPLY_TO` env (drop the literal); shipping-confirmation template + `shipment.created` subscriber (global-container rule); password reset — `auth.password_reset` subscriber + template + `STOREFRONT_URL` env, storefront forgot/reset pages via `sdk.auth.resetPassword`/`updateProvider` (actions return strings, never throw); change-password → reset-email button (decision D4).
- verify: live roundtrips — order → confirmation email; ship → shipping email; forgot → reset → login; reply-to correct
- done: 2026-07-10 — merged to `main` (merge `7ec274e`, branch `feat/transactional-email-recovery`, 10 commits). SDD (8 tasks, per-task review) + opus whole-branch review (3 Important fixes: shipping email now lists only THIS shipment's `fulfillment.items` not the whole order; loud prod guard when `STOREFRONT_URL` is localhost; refreshed the stale password e2e). Resend SEND path was already code-complete — setting `RESEND_API_KEY`+`RESEND_FROM_EMAIL` (+ verified Resend sender domain) flips order emails on. Added shipping-confirmation + password-reset templates+subscribers (event/payload verified vs installed 2.13.6), storefront forgot/reset pages (no enumeration, redirect-outside-catch, Suspense toast), D4 reset-email button. Gate: backend tsc 1 (B11 baseline); storefront vitest 337, tsc 5-baseline. **Ops (pending): set `RESEND_API_KEY`+`RESEND_FROM_EMAIL`+`STOREFRONT_URL` on Railway backend + verify Resend sender domain; deferred live roundtrips.** Plan [docs/done/plans/2026-07-10-transactional-email-recovery.md](../done/plans/2026-07-10-transactional-email-recovery.md) (→ done/ in WB-083 sweep).
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §2 (supersedes the reply-to half of WB-031)

### WB-079 · Bug batch — B1–B11 from the 2026-07-10 audit   [HIGH]
- status: done
- area: storefront tire-discovery/checkout/cart/PDP/middleware; backend vendor-sync service/admin route
- evidence: per-bug file:line table in the spec (B1 tire orphaned-`?fit` HIGH; B2 prod-redacted checkout errors; B3 cart never linked to customer → orders missing from /account/orders; B4 finish-switch bolt/grid desync HIGH; B5 SFTP zero-files run "completed"; B6 purge-products unguarded; B7–B11 lows)
- problem: eleven verified bugs — the worst: clearing/switching a vehicle on /tires leaves an invisible stale fit filter; logged-in customers' orders never appear in their account; checkout failure copy is redacted in prod right after a card auth; a finish switch can put a wrong-bolt-pattern variant in the cart.
- fix: one branch, one commit per bug, failing-test-first where a pure seam exists — full table in the spec §3.
- verify: per-bug verify column in the spec; storefront tsc stays 5-baseline (backend reaches 0 via B11)
- done: 2026-07-10 — merged to `main` (merge `8094f10`, branch `feat/bug-batch-b1-b11`, 14 commits: one per bug + a review-fix commit for B4 and B2). SDD per-bug spec+quality review + fix loops (B4 had a WB-048 placeholder-chip regression caught+fixed; B2 had a post-charge unhandled-throw caught+fixed) + opus whole-branch review (merge: yes, 5 cross-bug interactions verified compose cleanly, no Critical/Important). **Backend `tsc --noEmit` now 0 (B11 gate met)**; backend vendor-sync jest 316; storefront vitest 343, tsc 5-baseline. Deferred Minors: **F14 payment-button transport-error guard + F15 `errText`/`medusaError` dedup ✅ DONE via the G10 cleanup branch (merge `552a766`, 2026-07-11)**; still-open low-priority: `terminalStatusForFeed` `"data"` type-literal label; active-chips `hasFitParam` gates `"fit"` only; B1 manual chip-clear leaves inert `fitl`/`fits` cruft; **Stripe `handlePayment` stuck-spinner (declined card / unexpected intent status / no `.catch` on SDK rejection) ✅ FIXED (merge `3b649f8`, 2026-07-11) — all three exits release the spinner, new `.catch` re-throws NEXT_REDIRECT via `unstable_rethrow`.** The cleanup branch also dropped the 3 demo S3 image hosts from `next.config.js` (WB-081 residual) + added category/collection URLs to `sitemap.ts` (WB-082 residual). Sentry still deferred (needs a DSN/vendor decision). Plan [docs/done/plans/2026-07-10-bug-batch-b1-b11.md](../done/plans/2026-07-10-bug-batch-b1-b11.md) (→ done/ in WB-083 sweep).
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §3 ; findings audit §2

### WB-080 · Money integrity — Stripe capture decision, live cutover, US tax   [BLOCKER]
- status: done (code + runbook 2026-07-11, merge `de8c0e8`; D2 = automatic capture, D3 = manual tax region now / provider later. REMAINING = OPS: run `create-us-tax-region.ts` + enter nexus rates in admin, Stripe live keys/webhook + storefront rebuild, run `strip-manual-payment.ts` + `update-shipping-prices.ts` — all scripted step-by-step in [docs/reference/go-live-runbook.md](../reference/go-live-runbook.md))
- area: backend `medusa-config.js` Stripe options + admin tax setup + ops runbook
- evidence: `@medusajs/payment-stripe` defaults `capture_method: "manual"` (no `capture: true` passed); seed.ts:154-161 creates tax regions for 7 EU countries only; STATUS pending: `strip-manual-payment.ts` + `update-shipping-prices.ts` unrun on prod
- problem: every order is authorize-only (money never captured unless done manually in admin within ~7 days); US orders compute $0 sales tax; manual payment still placeable until the script runs.
- fix: `capture: true` (decision D2) + live-mode cutover runbook (live keys, live webhook, storefront rebuild) + US tax region/rates in admin (decision D3, nexus states from merchant) + run both guarded prod scripts.
- verify: live test order captures (not just authorizes), taxes correctly, shipping $150→$10/$250→$0, Manual absent
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §4

### WB-081 · Ops hardening — vendor-sync alerting, middleware fallback, provisioning, legal pages   [MEDIUM]
- status: done (2026-07-11, merge `f645a66`; watchdog job + alert template + fail-open middleware [hardened by review: res.ok + validated fallback region] + 5 policy pages + template drift. REMAINING = OPS: set `OPS_ALERT_EMAIL`, review the DRAFT policy copy [runbook §9], purge demo products + drop demo S3 hosts [runbook §7])
- area: backend subscribers/jobs + env templates; storefront middleware + static pages
- evidence: vendor-sync failures are `logger.error` only (vendor-sync-tick.ts:26); middleware.ts:22-30 region fetch has no try/catch (backend blip → every page 500s); `/contact` linked from order-Help but has no route; `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`/`NEXT_PUBLIC_STRIPE_KEY` absent from the storefront template
- problem: a dead feed is invisible for days; a cold edge instance 500s the whole site on a backend blip; provisioning from templates is broken; no contact/returns/privacy/terms pages (Stripe live + ads expect them); demo apparel products still in prod.
- fix: failure-alert subscriber + 24h watchdog job (email via Notification module, `OPS_ALERT_EMAIL`); middleware fallback to `DEFAULT_REGION`; template drift fixed; legal/support static pages + dead links wired; demo purge + drop demo S3 hosts.
- verify: forced failed run → alert email; backend down → storefront serves; fresh-clone template boot; `/contact` renders
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §5

### WB-082 · SEO + observability — robots/sitemap, error pages, Sentry/analytics   [MEDIUM]
- status: done (2026-07-11, merge `03c0480`; robots + Meili-fed sitemap [review fix `09fd966`: middleware matcher was 307ing both into 404s] + 3 error boundaries + env-gated Plausible. DEVIATION: Sentry deliberately NOT wired — needs a vendor account/DSN decision first; revisit as a small follow-up when one exists)
- area: storefront `app/` (robots.ts, sitemap.ts, error boundaries); both apps (telemetry, env-gated)
- evidence: no robots/sitemap/error.tsx/analytics/error-tracking matches anywhere in storefront/src or public/
- problem: a ~2,700-product catalog invisible to crawlers; unstyled Next default on any prod error; zero telemetry on failures or traffic.
- fix: `robots.ts` + Meili-fed `sitemap.ts` (wheels + tires, country-prefixed); WB-styled `error.tsx`/(checkout)/`global-error.tsx`; Sentry + lightweight analytics, all env-gated OFF by default (client picks vendors).
- verify: `/robots.txt` + `/sitemap.xml` serve (spot-check a wheel + tire URL); forced error → styled boundary; DSN set → event lands
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §6

### WB-083 · Docs truth sweep #2 — post-WB-076/G9 drift   [LOW]
- status: done (2026-07-11; 13 shipped specs/plans moved to done/ [tire arc + WB-077/078/079 plans + the G10 spec], every ref repointed, WB-069 over-claim corrected in STATUS, WB-072 backfill-garage-bore deploy step annotated mooted-by-WB-076, storefront/CLAUDE.md de-staled, STATUS Tests block re-baselined [325/126/343]. NOTE: STATUS "unpushed" wording was NOT struck — it is accurate again, everything since `a614063` is local until the next push)
- area: docs/ + storefront/CLAUDE.md
- evidence: docs/in-progress/ = 9 stale shipped-tire-arc files; STATUS "unpushed" claims stale; WB-069 "all 76 fixed" over-claim (~16 unreferenced, 3 re-verified present); WB-072 deploy step mooted by WB-076; storefront/CLAUDE.md contradicts shipped reality in 3 places
- problem: the dashboards no longer describe the repo; the over-claim hides open findings.
- fix: move tire specs/plans to done/, fix refs, strike stale claims, annotate WB-069 + WB-072, correct storefront/CLAUDE.md; run /doc-review as the gate. Runs LAST (re-baselines counts the other clusters move).
- verify: /doc-review clean; no `in-progress/` refs to shipped work
- refs: spec [docs/done/specs/2026-07-10-launch-readiness-fixes-design.md](../done/specs/2026-07-10-launch-readiness-fixes-design.md) §7

### WB-084 · Hide products with no image everywhere   [MEDIUM]
- status: done (2026-07-13, branch `feat/wb-084-hide-imageless-products`, unmerged; SDD 4 tasks + fix wave, per-task review + opus whole-branch review = merge-ready. Ops to activate: backend deploy → run `reindex-search-products.ts` on prod → storefront rebuild)
- area: backend/vendor-sync-search + backend/medusa-config + storefront (pdp, home, discovery-adjacent listings)
- evidence: backend/src/modules/vendor-sync/search/build-search-document.ts (image gate) ; backend/medusa-config.js (forced `product_type:'non-wheel'` stub) ; storefront/src/modules/product-detail/data/get-product.ts (PDP `notFound()`)
- problem: a product with no `thumbnail` still appeared on every storefront surface, rendered with a `<Wheel>` line-drawing placeholder instead of being hidden.
- fix: define `hasImage(thumbnail)` = non-empty trimmed string (backend + storefront twins); the Meili transformer returns `null` for image-less products (so they leave the wheel/tire index) and the coalesce stub is forced to a constant `non-wheel` `product_type` so an image-less WHEEL can't slip back in; storefront guards on the Store-API surfaces the index doesn't feed — PDP 404 (wheel+tire), related + featured filters, and the legacy `PaginatedProducts` collections/categories path; a one-time `reindex-search-products.ts` `medusa exec` script re-emits `product.updated` to purge already-indexed image-less docs. Non-destructive (no catalog deletes).
- verify: an image-less product is absent from `/store` + home + related + `/collections/*` + `/categories/*`, and its PDP 404s; `buildSearchDocument` returns `null` for a thumbnail-less wheel AND tire (unit); backend test:sync 330/6-skip, storefront vitest 352 (57 files).
- refs: spec [docs/done/specs/2026-07-13-hide-imageless-products-design.md](../done/specs/2026-07-13-hide-imageless-products-design.md) ; plan [docs/done/plans/2026-07-13-hide-imageless-products.md](../done/plans/2026-07-13-hide-imageless-products.md)

---

## G11 · Storefront trust & correctness (2026-07-13 UX audit)

> All finding ids (N/D/P/C/A/X/L) reference the
> [2026-07-13 UX completeness audit](plans/2026-07-13-ux-completeness-audit.md);
> per-task designs in the [consolidated fixes spec](specs/2026-07-13-ux-completeness-fixes-design.md).
> Static audit — each task re-verifies its findings against current `main` first (G9/G10 discipline).

### WB-085 · Site chrome integrity — dead nav/footer links, fabricated drawer content   [HIGH]
- status: done
- area: storefront/layout + storefront/search + storefront/home
- evidence: storefront/src/modules/layout/templates/nav/index.tsx:12-20 (Brands→/collections 404, Style→/categories 404, 3× href="#") ; footer/index.tsx:6-46 (9 dead links, fixture brand names) ; search-drawer/trending.tsx:10-38 (fabricated products)
- problem: 5 of 7 nav items and 9 footer links are dead or placeholders on every page; the drawer's Trending panel shows fabricated products with fake prices that dead-end in zero-result searches; not-found pages are chrome-less boilerplate. Findings N1-N3, N6, N8-N11, X9.
- fix: shared NAV_ITEMS module repointed to real routes (Support→/contact, Brands/Style→/store presets interim), delete placeholder items, live footer links from styleTiles()/brand facet, Trending fed by real newest products, mobile-menu vehicle row, catalog-wall slice offset, WB not-found pages, /results+/search redirects.
- verify: every nav/footer/drawer href resolves 200; grep shows no `href="#"` in layout modules and no fabricated product names in search components.
- done: 2026-07-14 — SDD on branch feat/g11-wave1-discovery-nav (unmerged). Shared NAV_ITEMS + repointed dead nav/footer links (Brands/Style→/store interim, Support→/contact, deleted Build Gallery/Deals), footer real facet+brand links (top-5 live brands) + live brand count, real search-drawer Trending (top-3 newest→PDPs), de-duped catalog wall, "New This Week"→"New Arrivals", mobile hamburger vehicle row, removed heart "Saved", WB-branded not-found ×4, next.config /results+/search redirects. Whole-chunk review caught a /results redirect 500 (:query* array) — fixed to single-segment (308). Gate: storefront vitest 439, tsc 5-baseline, next build 0.
- refs: [spec §WB-085](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-086 · Retire (redirect) the legacy /categories + /collections listing path   [HIGH]
- status: done
- area: storefront/routes + storefront/store-modules + sitemap
- evidence: storefront/src/lib/data/products.ts:107-151 (fetch capped at 100, sliced against real count) ; modules/store/templates/paginated-products.tsx:61-71 ; app/sitemap.ts:66-95 (advertises them) ; categories page:58-64 ("| Medusa Store" title + canonical resolving to a 404)
- problem: /categories/wheels advertises ~144 pages but pages 9+ render an empty grid; sort only orders the first 100; N+1 fetch per card; boilerplate titles/branding; the sitemap sends crawlers there. Finding D1.
- fix: 301 categories/wheels→/store, categories/tires→/tires, collections/[handle]→/store?brands=<brand> (route-level lookup); drop taxonomy from sitemap; quarantine/delete the dead PaginatedProducts path (respecting retained imports per storefront/CLAUDE.md).
- verify: legacy URLs 301 to discovery equivalents; sitemap has no /categories//collections URLs; build + vitest green after module removal.
- done: 2026-07-16 — SDD on branch `feat/g11-wave4-cleanup` (G11 Wave 4, chunk tip `40cb546`). 301 `/categories/wheels`→`/store`, `/categories/tires`→`/tires`, `/collections/[handle]`→`/store?brands=<title>` (route-level lookup; `/collections` itself 308s via `permanentRedirect`); taxonomy dropped from `sitemap.ts`; the dead `PaginatedProducts`/`product-preview`/legacy-PDP-template family deleted (zero live importers), orphaning `filter-radio-group`/`skeleton-product-grid`/`skeleton-product-preview`/`product-price`'s sole remaining importer chain (left in place, documented follow-up, not this item's scope) and the also-orphaned `related-products/` (deleted outright). Storefront tsc baseline dropped 5→4→2 (Task 3's dead `getCollectionsWithProducts` export removal, then the Task 4 review fix deleting the dead `related-products/`). A review pass corrected earlier over-confident doc claims (tsc-drop attribution, orphan list, the live `/collections/[handle]` redirect route). Gate: storefront vitest 758/109 files, tsc 2-baseline (held).
- refs: [spec §WB-086](specs/2026-07-13-ux-completeness-fixes-design.md) ; [done/specs/2026-07-15-wb-086-retire-legacy-listings-design.md](../done/specs/2026-07-15-wb-086-retire-legacy-listings-design.md) ; [done/plans/2026-07-15-wb-086-retire-legacy-listings.md](../done/plans/2026-07-15-wb-086-retire-legacy-listings.md)

### WB-087 · Search that finds products — model names, synonyms, size tokens, visible query   [HIGH]
- status: done
- area: backend/vendor-sync-search + backend/medusa-config + storefront/discovery
- evidence: backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts:165-170 (title = Brand + DisplayStyleNo) ; build-metadata.ts:24-30 (Style name → metadata only) ; medusa-config.js:265 (searchableAttributes title/brand/skus, no synonyms) ; storefront discovery header/active-chips (q invisible/unclearable)
- problem: "nomad" (the wheel's actual model name) returns 0 results; "rims" returns 0; size-first queries return 0; and after searching, the page shows no query indicator and no way to clear it. Findings D2, D3, L2, L7.
- fix: index + searchable `style` and a `search_text` field (sizes + canonical patterns), append the real style name to product titles (handles unchanged), synonyms block; storefront renders "RESULTS FOR" + a removable q chip + q in isAnyFilterActive (both discovery twins).
- verify: post re-sync, "nomad"/"rims"/"20x9 <brand>" return hits; searching renders the query with a clear affordance.
- done: 2026-07-14 — SDD (same branch). Backend: style + per-variant search_text in the Meili doc (no cross-join false tokens); searchableAttributes +style +search_text + synonyms (rims↔wheels, tyre↔tire); wheel title gets the model name via isRealStyleName (alpha-run≥3 ∧ ≠code, keeps PR126/P3B as codes) + a retitle-wheels.ts medusa-exec script. Storefront: visible + clearable ?q on both discovery surfaces. Opus whole-chunk review caught inert synonyms — fixed by seeding category tokens ("wheels"/"tires") into search_text. Gate: backend test:sync 365, storefront vitest 439. DEPLOY (order load-bearing): restart(settings) → retitle-wheels.ts → full Meili reconcile.
- refs: [spec §WB-087](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-088 · Discovery filter & listing truth   [MEDIUM]
- status: done
- area: storefront/discovery + storefront/tire-discovery + backend/medusa-config (2 settings)
- evidence: get-products.ts:44,65-66 (facet on RAW bolt strings — 5X114.3 vs 5X4.49 split) ; :115-126 (card diameters[0] + price_min 0) ; :382-385 (outage → "no wheels match these filters") ; get-tire-products.ts:154-181 (200-cap without isCapped) ; filter-sections.tsx:220-244 (per-keystroke navigation) ; medusa-config.js:264-284 (no maxValuesPerFacet → facet lists truncate at 100)
- problem: the bolt-pattern filter silently drops products spelled in the other unit; cards contradict active filters; outages read as empty catalogs; tire fit-mode lies about totals; facet lists invisibly truncate. Findings D4-D13.
- fix: canonical bolt-pattern facet with dual-unit labels; card size-range/count + $0 guard; discriminated outage state; tire isCapped parity; debounced validated price inputs; maxValuesPerFacet 500 + size type-ahead; numeric facet sort; page clamp; backslash escape; scroll/fit=0/totalHits polish.
- verify: one physical pattern = one checkbox; Diameter=22 filter shows 22" on cards; forced Meili outage renders the unavailable state, not "no matches".
- done: 2026-07-14 — SDD (same branch). Canonical bolt-pattern facet (one physical pattern = one checkbox) + dual-unit label (pcdInchLabel); honest cards (diameter range/"N sizes" + $0 suppression, both cards); outage-honest empty state ({ok:false}, both surfaces, never cached); tire fit-mode isCapped parity; price inputs commit-on-blur+clamp/swap (both); maxValuesPerFacet:500 + tire size filter-as-you-type; polish (numeric facet sort, inch marks, page clamp, lit() backslash escape, scroll-to-top, fit=0 survival, exhaustive counts, section-scoped dup ids). Opus whole-chunk review: all 7 risks verified end-to-end; fix wave for X10 section ids + recent-search fit=0 parity + price-commit progress router. Gate: storefront vitest 439, backend test:sync 365. DEPLOY: rebuild + one restart for maxValuesPerFacet (no re-sync).
- refs: [spec §WB-088](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-089 · Catalog lifecycle & data integrity — index eviction, phantom stock, $0 prices   [HIGH]
- status: done
- area: backend/vendor-sync + backend/medusa-config
- evidence: medusa-config.js:258-263 (plugin `fields` lacks `status` → drafted products re-indexed forever, verified vs plugin 1.3.5 source) ; pipeline/stage.ts:92-104 + service.ts:553-557 (stock staging qoh>0-only feeds the stock-only part selection → all-warehouse sellouts keep phantom stock ≤12h) ; parse-helpers.ts:86-92 + schema.ts:39 ($0 MSRP ungated) ; build-search-document.ts:66-95 (discontinued variants still contribute price/facets) ; tire-parse-helpers.ts:77-156 (dash-metric sizes unparsed → part-number size labels)
- problem: discontinued products stay in search (cards → dead PDPs, sitemap emits dead URLs); sold-out-everywhere SKUs stay buyable up to 12h; $0 rows render "From $0.00" and win price-asc; dead variants back card prices; BLANK/CALL placeholders reach the UI; slug collisions silently drop groups. Findings L1, L3-L5, L8-L10.
- fix: add 'status' to plugin fields + daily meilisearch.sync reconcile; stock-only stagedParts from vendor_feed_staging; staging gate msrpUsd<=0; skip discontinued variants in both doc builders; placeholder-pattern filter at the transformer (+ "call" in the storefront twin) — closes the WB-074 follow-up; tire dash-size pattern + brand-model alias map + stricter model confidence; handle-collision suffix retry.
- verify: test:sync RED-against-old cases per item; post-deploy: a drafted product leaves Meili within the reconcile window; forced all-zero part shows 0 stock after the next stock tick.
- done: 2026-07-13 — SDD on branch `feat/wb-089-catalog-lifecycle` (unmerged). 7 fixes / 12 commits + whole-branch-review fix wave: L1 `status` added to Meili `fields` (verified vs plugin 1.3.5 upsert delete-on-non-published) + daily `meilisearch.sync` reconcile cron; L5 stock-only parts sourced from `vendor_feed_staging` (zero all-warehouse sellouts); L3 staging drops `msrpUsd<=0` + `skipped_invalid_price_count` col (migration); L4 both doc builders skip `metadata.discontinued` variants (zero-live→null); L9 placeholder-pattern filter at the transformer + byte-identical storefront twin; L8 dash-metric size parse + glued-prefix strip + `sizeToken`-gated model confidence + display-only brand→model alias (identity/handle unchanged); L10 deterministic `-<hash6(group_key)>` handle-collision retry. Per-task + opus whole-branch review (merge: yes, with fixes — all applied). Gate: test:sync **359**/6-skip, tsc 0, `medusa build` 0. **Deploy: restart (fields+cron) → migration auto-runs → FULL Meili re-sync (doc shape L4/L8/L9 + evicts already-indexed drafts; same re-sync WB-087 needs). OPS-VERIFY (blocks L10 "done", not merge): live two-colliding-group smoke test confirms the retry fires (Medusa error shape). Deferred FUs → backlog: admin-surface `skipped_invalid_price_count`; extract the dup live-variant filter; stock-tick now iterates the full catalog every 3h (confirm <3h).** SDD [spec](../done/specs/2026-07-13-wb-089-catalog-lifecycle-design.md) · [plan](../done/plans/2026-07-13-wb-089-catalog-lifecycle.md).
- refs: [spec §WB-089](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-090 · PDP purchase honesty — stock, price, and selection truth   [HIGH]
- status: done
- area: storefront/pdp (wheel + tire)
- evidence: group-sizes.ts:88 + hero/index.tsx:140-147 (availability-blind default offset → Status "In stock" beside an "Out of stock" button) ; purchase-panel:62-66 + pdp-config:15-21 (qty default 4, stepper cap 99, inventory-blind → doomed adds read "try again") ; hero/index.tsx:209-212 (sibling-price fallback; $0 purchasable) ; regions.ts:45-47 (backend outage → every PDP 404s) ; apply.ts:392-413 (no description → empty <p> + empty meta)
- problem: the size grid, Status stat, price and buy button can all disagree on one screen; quantity limits are invisible until a cryptic failure; several guard/display gaps (tire variant-less, 0×0, +-12MM offsets, one shipping weight for all sizes). Findings P1, P2, P7-P12, P15-P19, L6.
- fix: best-availability default offset + selected-variant Status; inventory-threaded qty cap + "Only N left" + insufficient-stock error branch; no cross-variant price fallback + "Price unavailable" gate; tire B8 guard; focusable OOS cells + all-OOS banner; finish-switch size continuity; +variants.weight per-size ("shipping weight"); sign-aware offsets; chip dedupe; region fetch-fail → error boundary not 404; description guard + templated meta fallback.
- verify: mixed-availability product: Status/price/button agree on every selection; adding 4 of a 2-left variant explains itself; vitest per rule.
- done: 2026-07-15 — SDD on branch feat/g11-wave2-pdp-fitment (unmerged). PDP purchase honesty (wheel+tire): best-availability default offset + Status reads the selected variant (Status/price/button now agree); inventory-aware qty (quantity threaded from the already-fetched inventory_quantity — cap + "Only N left" + a real insufficient-stock message; addToCart changed throw→return {error?} so Next.js doesn't redact the message in prod — all 4 live callers updated, Buy Now doesn't proceed on error); price truth ($0→"Price unavailable"+disabled, no sibling fallback); per-variant shipping weight (+variants.weight); sign-aware offsets; tire variant-less + 0×0 guards; focusable OOS cells + all-OOS banner (both surfaces); finish-switch size continuity; getRegion outage→error boundary (not a 404 on every PDP). Opus whole-chunk review (With fixes, no Critical; addToCart contract verified safe). Gate: storefront vitest 537, tsc 5-baseline. LIVE-VERIFY: insufficient-stock keyword vs Medusa 2.13.6 real error string.
- refs: [spec §WB-090](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-091 · Fitment honesty completion — verdict consistency + grounded claims   [HIGH]
- status: done
- area: storefront/fitment (pdp wheel+tire, search drawer) + backend/wheel-size (read shape)
- evidence: tire/fitment.tsx:42-46,100-110 (no-OEM-data renders "runs a different factory size") ; purchase-panel:48-59 (wheel chip "DOESN'T FIT" where the band says unknown) ; fitment/index.tsx:122-136 + fits-vehicle.ts:57-62 (band subtext from variants[0]-bore product verdict) ; fitment/index.tsx:124 + tire/fitment:155-163 + advanced-fitment-panel:97-103 (fabricated process claims + href="#" links) ; lib/garage/vehicle-data.ts:10-40 (stale slug-incompatible YMM fallback) ; ymm-pane.tsx:202-271 (failed resolve leaves a window-less vehicle with no retry path)
- problem: missing data renders as negative verdicts (kills sales); chip/band contradict on the same page; fitment surfaces promise processes that don't exist; the resolve-failure path strands vehicles fitment-less forever. Findings P3-P6, P13, P14, N4, N5, N7.
- fix: tire unknown tier + neutral chip; wheel chip unknown parity; band subtext from fitView + most-permissive bore for product-level verdicts; tire YOUR-VEHICLE year/trim match; reverse-fitment non-exhaustive disclosure + CTA; ground/delete each fabricated claim; regenerate vehicle-data.ts from a wheel-size slug snapshot (years→2027); "Re-check fit" affordance for window-less vehicles; honest unavailable-toast copy.
- verify: vehicle with no OEM tire data shows the unknown band, not a mismatch claim; chip/band agreement matrix (4 tiers × wheel/tire) unit-tested.
- done: 2026-07-15 — SDD (same branch). Tire three-state fit verdict (fits/no/UNKNOWN — no OEM data ≠ a false "runs a different size"); wheel chip stops saying "DOESN'T FIT" where the band says unknown (chip↔band agree fits/check/no/unknown both surfaces); band subtext derives from per-variant buildFitView; reverse-fitment uses the per-size bore set (backend by-product boreMm→CSV); grounded 6 fabricated claims/dead links (no href="#" remain); shared vehicle-entry-match (year-range+trim) ported to tires; wheel non-exhaustive disclosure + hide-0-count; N4/N5/N7 recovery (YMM years→2027, slugifyYmm seed values, "Re-check fit" action, honest resolve-failure toasts). Opus whole-chunk review: With fixes (recheckFit slugify + honest fits-tier band copy + tire 0-count parity). Gate: storefront vitest 537, backend test:sync 365 + test:fitment 144. Deploy: rebuild (backend-first for the boreMm CSV route).
- refs: [spec §WB-091](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-092 · Cart & checkout correctness — stored prices, stock preflight, resilient failures   [HIGH]
- status: done
- area: storefront/cart + storefront/checkout + storefront/order
- evidence: line-item-price:14-23 (live-variant pricing → drift vs stored totals; discontinued item renders "$NaN" + /products/undefined) ; payment-button:136-197 (charge precedes placeOrder, no stock preflight; capture:true) ; cart.ts:21-27 + checkout-form:32-34 (outage → "Nothing in your cart" / vanished form) ; orders.ts:8-17 (order-confirmed rethrow → 500s a just-charged customer) ; (checkout)/layout.tsx:36-54 (fictional 555 phone; unlinked TERMS/PRIVACY; APPLE/GPAY badges) ; order-completed-template:30-97 (hardcoded "FREE 2-3 DAY UPS", view-time ETA, SMS claim)
- problem: the money path can display amounts that were never charged, charge cards for stock that's gone, and dissolve into lies under failure; the payment moment carries fake trust signals. Findings C1-C14.
- fix: line rows render item.unit_price/item.total (never NaN); server-side stock preflight before the client may confirm payment + cart OOS badges; retrieveCart/CheckoutForm/retrieveOrder honest failure modes; B2 error-shape for the 4 still-throwing cart actions; real /contact link + linked policies + badge cleanup; order.shipping_methods-derived confirmation + created_at-anchored ETA; fit-card `every` + policy-aligned refund copy; receipt decimal fix + guards; step clamp; sliding cart cookie; finish options + per-finish thumbnails on lines.
- verify: test-Stripe run: OOS between add and pay blocks BEFORE charge naming the item; discontinued carted product renders stored title/price; forced backend failure at cart/checkout shows retry states, not empties.
- done: 2026-07-15 — SDD on branch feat/g11-wave3-transact-account (unmerged). Cart/mini-cart price from the STORED charged amount (kills bare-"NaN" + /products/undefined on a discontinued line); STOCK PREFLIGHT before payment capture (checkStockAvailability gates every payment button before the provider call — no more charge-then-fail; fails open on a fetch blip by design, reviewed); retrieveCart rethrows on outage (404→null) so a blip no longer says "empty cart" (+CartButton guarded so the layout can't 500); retrieveOrder catches→null so notFound() finally fires; B2 {error?} extended to updateLineItem/deleteLineItem/applyPromotions + surfaced DeleteButton errors; checkout chrome trust (fake phone→/contact, policies linked, APPLE/GPAY dropped); honest confirmation (shipping/ETA from the order, no SMS claim); fit card .some→.every + real refund copy; receipt decimal/guards; finish visible on cart lines; step clamp + sliding cart cookie; Next-15 params + typo. Opus whole-chunk review: merge with 2 fixes (currency threading + full-width CartButton guard + gated review preflight + no fabricated discount badge). Gate: storefront vitest 664, tsc 5-baseline, next build compiles.
- refs: [spec §WB-092](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-093 · Account & order-history truth   [HIGH]
- status: done
- area: storefront/account + storefront/order (shared components) + backend/config (jwtExpiresIn)
- evidence: profile-billing-address:37-40 (wired to wrong action — can never save) ; profile-email:19-34 (fake-success no-op) ; order-details:39-57 (status labels render EMPTY strings; no tracking anywhere; fulfillments never fetched) ; account/layout.tsx:11-17 (no parallel-route default.tsx → refresh+logout = 404) ; orders.ts:19-27 (history capped at 10) ; register:65-72 (no password rules) ; customer.ts:145-151 (un-awaited removeAuthToken — the banned auth class) ; cookies.ts:18 vs medusa-config.js:98-99 (7d cookie vs ~1d JWT)
- problem: the account section fake-succeeds on edits it never persists, hides order status/tracking entirely, 404s on refresh edge-cases, and silently logs users out on day 2. Findings A2-A6, A8-A15.
- fix: real updateCustomerBillingAddress action; email field read-only + support copy; fulfillment fields + status/tracking rendering + honest orders copy; @login/@dashboard default.tsx; orders pagination; minLength=8 + server check; await removeAuthToken + drop dead tag; jwtExpiresIn aligned to the cookie; dead links → /contact //privacy //terms; phone editor tel/optional; typo + order-card-math sweep.
- verify: billing address saves and shows on the overview; order detail shows real statuses + tracking; refresh /account/profile then logout → login form not 404; 11th order reachable.
- done: 2026-07-15 — SDD (same branch). Billing address actually saves (dedicated find-or-create updateCustomerBillingAddress → profile reaches 100%); email edit → honest read-only ("contact us"); REAL order/payment status + tracking (retrieveOrder +*fulfillments,*fulfillments.labels; formatStatus re-enabled; trackingLinks) + mounted the already-built PaymentDetails on the account order detail; parallel-route default.tsx for @login/@dashboard (a hard nav to a nested dashboard route no longer 404s); orders ?page= pagination + clamp; password rules (client + server — Medusa's emailpass enforces none); awaited signout + dropped dead revalidateTag("auth"); dead links → /contact,/privacy,/terms; phone type=tel; copy/typo sweep; backend jwtExpiresIn "7d" (Medusa's default is 1d — sessions died on day 2). Opus whole-chunk review: with fixes (login-slot default renders the login page — the original reasoning was inverted; + phone/page-clamp/lint/comment cleanups). **Caught + fixed a BUILD BREAK: a non-async pure helper exported from the "use server" customer.ts → "Server Actions must be async functions"; vitest+tsc are blind to that rule, only next build catches it.** Gate: storefront vitest 664, tsc 5-baseline, next build compiles, lint clean, medusa build 0.
- refs: [spec §WB-093](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-094 · Transactional email reliability & coverage   [HIGH]
- status: done
- area: backend/email-notifications
- evidence: services/resend.ts:97-102 (Resend SDK returns {data,error} and never throws — provider logs "Successfully sent" on rejection; catch parses a SendGrid-shaped error) ; templates/order-placed.tsx:50,74-103 (raw "1479.96 usd", flex-div layout, no branding, NO link back to the order — a guest's only route back) ; templates/index.tsx:9-15 (no order-canceled or welcome template)
- problem: every transactional email can silently fail while recorded as delivered; the two highest-value emails are unbranded, money-unformatted, and don't link the order. Findings A1, A7.
- fix: throw on Resend {error}; branded base header/footer + table layout + Intl.NumberFormat money + "View your order" STOREFRONT_URL button (order-placed + shipping); order.canceled subscriber+template; reset email states the real 15-min expiry; optional welcome template behind a decision flag.
- verify: jest: provider throws on error result; template snapshots show branding/formatted money/order link; live roundtrip once RESEND_* set (runbook §1).
- done: 2026-07-15 — SDD (same branch). FAIL LOUD: the Resend provider now reads {error} and throws (resend.emails.send RESOLVES {data,error} — it never rejects — so every API rejection was recorded SUCCESS and logged "Successfully sent"; only a thrown rejection sets NotificationStatus.FAILURE); branded base (header/footer, with a branded=false opt-out for the internal vendor-sync-alert) + formatUsd (Intl, major units) + Outlook-safe Row/Column item lists (@react-email has no Table) + a "View your order" link → STOREFRONT_URL/order/confirmed/<id> (a guest's only route back; verified /store/orders/:id needs no auth); order.canceled subscriber+template (honest — the payload carries only {id}, so no refund amount/ETA is promised); password-reset copy states the real 15-minute expiry. Whole-chunk review: with fixes (context-free footer, de-duped template chrome, no unbacked "a real person answers"). Gate: email jest 22, full backend jest 564/9-skip, medusa build 0. **OPS: needs RESEND_API_KEY+RESEND_FROM_EMAIL (+verified sender domain)+STOREFRONT_URL on prod — fail-loud means LOGS are the only signal of a misconfig; do a live roundtrip right after deploy.**
- refs: [spec §WB-094](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-095 · SEO & shareability — de-boilerplate, canonicals, structured data   [MEDIUM]
- status: done
- area: storefront/app (metadata, sitemap, middleware) + assets
- evidence: src/app/opengraph-image.jpg + twitter-image.jpg (site-wide "Next.js Starter Template / MEDUSA STORE" share card, visually verified) ; grep alternates|canonical → only the broken categories one ; middleware:151-163 (/de/store etc. indexable duplicates) ; lib/util/env.ts:1-3 (localhost metadataBase fallback) ; check-env-variables.js:3-10 (validates 1 of 5 load-bearing vars)
- problem: every social share advertises the boilerplate; no canonicals while duplicate region prefixes render; a mis-set env ships a silently empty catalog + localhost URLs in prod metadata. Findings X1-X3 + JSON-LD/title-template gaps.
- fix: WB share images + favicon + PDP og:image; root title template; us-canonical on every indexable page + 301 non-default region prefixes while single-region; Product + BreadcrumbList JSON-LD on PDP; sitemap lastModified; require the 4 missing NEXT_PUBLIC_* in check-env + loud localhost guard in sitemap/robots.
- verify: share-card validators show WB art; Rich Results test passes a PDP; curl /de/store → 301 /us/store; build fails when the required envs are absent.
- done: 2026-07-16 — SDD on branch `feat/g11-wave4-cleanup` (G11 Wave 4, chunk tip `e548db7`). Generated WB share OG image + favicon (vendored Antonio subset font, OFL-licensed) + per-PDP og:image; root title template; us-pinned canonical on every indexable page + a 301 for non-default region prefixes (self-disable guarded against looping on the default-region resolve); Product + BreadcrumbList JSON-LD on the PDP (single-leaf-sourced price/availability so they can't disagree with the rendered page — see `structured-data/json-ld.ts`); `check-env-variables.js` now requires all 5 load-bearing vars (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` + the 4 WB-095 additions: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_SEARCH_ENDPOINT`, `NEXT_PUBLIC_SEARCH_API_KEY`) — build now fails loud instead of shipping localhost canonicals/an empty catalog. Gate: storefront vitest 758/109 files, tsc 2-baseline (held). **DEPLOY GATE (WB-108): confirm all 4 new required env vars are set in every Railway storefront environment before deploying this merge, or the build fails.**
- refs: [spec §WB-095](specs/2026-07-13-ux-completeness-fixes-design.md) ; [done/specs/2026-07-15-wb-095-seo-shareability-design.md](../done/specs/2026-07-15-wb-095-seo-shareability-design.md) ; [done/plans/2026-07-15-wb-095-seo-shareability.md](../done/plans/2026-07-15-wb-095-seo-shareability.md)

### WB-096 · Accessibility & interaction chrome   [MEDIUM]
- status: done
- area: storefront (design tokens, common components, middleware) — runs last in G11
- evidence: wheel-builds.css:318,371 (outline:none, zero :focus rules in the file) ; field/index.tsx:59-67 + ymm-pane:290-362 (YMM selects have no accessible name) ; delete-button:31-38 (unnamed icon-only remove) ; label/index.tsx (11px #FF6A00 ≈2.9:1) ; middleware:67,153-192 (self-redirect loop, notFound() in middleware, /US/ 404) ; filter-sections:54 (dup DOM ids) ; analytics/index.tsx (zero funnel events)
- problem: the flagship fitment flow is keyboard/screen-reader hostile; the two most-used text tones fail WCAG AA; middleware has three edge-case traps; the merchant has no funnel visibility. Findings X4-X6, X8, X10, X11 (+X7 noted).
- fix: :focus-visible rules + Field htmlFor wiring + aria-labels + aria-pressed; contrast token change (DESIGN.md decision: sub-18px accent → ~#D14A00, --ink-soft → ~#6E6E73); middleware same-URL fall-through + lowercase compare + no notFound(); instance-prefixed filter ids; Plausible add_to_cart/begin_checkout/purchase events; orphan cleanup (search-client.ts, side-menu, instantsearch deps); loading.tsx for / and (checkout); _next/image matcher note beside images.unoptimized.
- verify: axe clean on home/store/PDP/cart for labels/ids; keyboard-only purchase walk fully focus-visible; /US/store lands on /us/store.
- done: 2026-07-16 — SDD on branch `feat/g11-wave4-cleanup` (G11 Wave 4, chunk tip `25e776c`). Accessible names for both rails (Field htmlFor wiring, YMM select aria-labels, delete-button aria-label) + focus-visible rings + aria-pressed on toggles; contrast fix (`--orange-deep` landed at `#C64400`, not the ~#D14A00 first floated — that measured 4.28:1 on `#FAFAF8` and failed AA, `#C64400` clears 4.5:1; `--ink-soft` darkened `#8A8A8E`→`#6E6E73`; a pure `contrastRatio()` helper + `contrast-ratio.test.ts` pin both values); 3 middleware edge fixes (same-URL fall-through instead of a self-redirect loop, lowercase-prefix compare so `/US/store` lands on `/us/store` not a 404, dropped `notFound()` from middleware); home + checkout `loading.tsx` states + Plausible `add_to_cart`/`begin_checkout`/`purchase` funnel events; deleted the Algolia-era orphans (`lib/search-client.ts`, the layout copy of `country-select`, `side-menu`) + their 4 now-dead deps (`@meilisearch/instant-meilisearch`, `algoliasearch`, `react-instantsearch-hooks-web`, `@types/react-instantsearch-dom`). The 18px+ bold/display accent-text sites (`--orange` at ~2.9:1, below the 3:1 large-text floor in 5 places) were left as a documented, narrow exception rather than widened here — tracked as WB-105. Gate: storefront vitest 758/109 files, tsc 2-baseline (held).
- refs: [spec §WB-096](specs/2026-07-13-ux-completeness-fixes-design.md) ; [done/specs/2026-07-15-wb-096-a11y-interaction-chrome-design.md](../done/specs/2026-07-15-wb-096-a11y-interaction-chrome-design.md) ; [done/plans/2026-07-15-wb-096-a11y-interaction-chrome.md](../done/plans/2026-07-15-wb-096-a11y-interaction-chrome.md)

### WB-104 · Trim honesty — reverse-fitment identity + trim-narrowing integrity   [HIGH]
- status: done
- area: backend/wheel-size + storefront/fitment
- evidence: backend/src/modules/wheel-size/reverse-fitment.ts:47-62 (`extractVehicleIdentity` reads `raw.data[0]` — arbitrary trim — while WB-077's normalize.ts:54-65 unions windows/patterns across ALL trims; git-confirmed: identity is WB-009 `4d0992f`, union is WB-077 `0ae83be`) ; storefront/src/modules/product-detail/components/fitment/index.tsx:200-214 (YOUR-VEHICLE trim-label-vs-arbitrary-trim + make slug-vs-name compare) ; backend/src/modules/wheel-size/service.ts:227-233 (trim-empty → silent broad fallback) ; backend/src/modules/wheel-size/client.ts:55-57 (modifications catalog unscoped by region)
- problem: user-reported "trim fitment is wrong" — root-caused. The PDP "N CONFIRMED MODELS" lists (wheel + tire, shared helper) label union-of-all-trims cache rows with whichever trim the API returned FIRST, publicly attributing fitment to a trim it wasn't computed for ("Any trim" is the drawer default, so most rows are union rows). Knock-ons: the YOUR-VEHICLE highlight misfires (arbitrary trim + slug-vs-name make compare — multi-word makes never highlight); a non-usdm trim pick is silently discarded (global-catalog dropdown + broad fallback); the `/modifications/` slug assumption is untested.
- fix: multi-trim rows return `trim: undefined` from `extractVehicleIdentity` (only trim-narrowed rows may name a trim); slug-normalized make/model + label-or-slug trim matching for the highlight; region param on the modifications catalog + a `trimNarrowed` flag and warn-log on the broad fallback; gated live test pinning the modifications `slug` contract; ops check that prod runs WB-077 (+ truncate) — cache keys carry `|v2`.
- verify: multi-trim raw → identity without trim (unit golden); a trim-picked vehicle highlights its own confirmed-list row (live); "Land Rover" highlights despite the `land-rover` slug (unit); gated live: a dropdown slug narrows by_model non-empty.
- done: 2026-07-15 — SDD (same branch). extractVehicleIdentity is multi-trim-aware: a union row (>1 distinct trim, or any mixed known/unknown-trim row) claims NO trim instead of an arbitrary raw.data[0] one; +trimNarrowed on both reverse vehicle types (shared wheel+tire helper — one fix, both lists). Storefront slug-normalized make/model highlight (multi-word makes highlight again) + trim compare vs label AND modificationSlug for narrowed rows (both surfaces via vehicle-entry-match). Region-scoped modifications catalog (additive default usdm; cache-key +region self-heals) + logger.warn on the silent trim-fallback. Slug-contract tests (offline toOptions precedence + gated live). Whole-chunk review: With fixes (mixed-trim rule + honest trimNarrowed-first-fetch-only note). Gate: storefront vitest 537, backend test:fitment 144 + test:sync 365, medusa build 0. Note: trimNarrowed not persisted (first-fetch/refresh-only; the logger.warn is the authoritative fallback signal) — persisting is a tracked follow-up. Deploy: backend restart (no migration).
- refs: [audit §T](plans/2026-07-13-ux-completeness-audit.md) ; [spec §WB-104](specs/2026-07-13-ux-completeness-fixes-design.md) ; pairs with WB-091

### WB-105 · 5 sub-AA accent-text sites still under WCAG's large-text floor   [MEDIUM]
- status: todo
- area: storefront/design (needs a DESIGN.md decision first)
- evidence: storefront/src/modules/layout/components/mobile-menu/index.tsx:105 ; storefront/src/modules/product-detail/components/hero/variant-picker.tsx:212 ; storefront/src/modules/product-detail/components/tire/hero/size-picker.tsx:206 ; storefront/src/modules/discovery/components/grid/product-card.tsx:122 ; storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx:60 (all `text-[18px] font-black` on `--orange`) ; storefront/DESIGN.md §2 contrast rule (WB-096 X6) explicitly flags this as a documented, unwidened exception ; storefront/src/styles/wheel-builds.css:347,377,398,422,443 (`:focus-visible { outline: 2px solid var(--orange) }`, same ~2.9:1 root cause)
- problem: WB-096 (X6) fixed sub-18px accent text (`--orange`→`--orange-deep`, 4.75:1) but explicitly left the 18px+ bold/display accent-text sites alone as "a documented, narrow exception at the large-text boundary, not fully re-verified to 3:1 in every instance" — these 5 sites render bold 18px `--orange` (~2.9:1 on `#FAFAF8`), just under WCAG's large-text floor (18.66px bold / 24px regular needs only 3:1, but 18px still rounds under the pt threshold in most checkers) — and the same `--orange` value backs every `:focus-visible` ring project-wide, which sits marginally under SC 1.4.11's 3:1 non-text-contrast requirement.
- fix: a DESIGN.md decision — either move these 5 sites to `--orange-deep` (consistent with the sub-18px rule, may read slightly duller at display weight) or bump them to ≥24px/regular-weight so the 3:1 large-text threshold unambiguously applies; decide the focus-ring color at the same time (same token, same root cause) rather than patching them separately.
- verify: all 5 sites + the shared `:focus-visible` rule measure ≥3:1 via the existing `contrastRatio()` helper (`lib/contrast-ratio.ts`), pinned by a test like WB-096's.
- refs: — (surfaced during G11 Wave 4 review of WB-096)

### WB-106 · Vendor-sync per-SKU-fallback wheel titles carry no brand   [LOW]
- status: todo
- area: backend/vendor-sync
- evidence: backend/src/modules/vendor-sync/pipeline/wheel-grouping.ts:183-191 (`buildGroupTitle` returns bare `record.title` when `displayStyleNo` is empty) ; backend/src/modules/vendor-sync/pipeline/tire-grouping.ts:58-61 (`buildTireGroupTitle`, same pattern on `record.model`) ; backend/src/scripts/retitle-wheels.ts:52-60 (`skippedNoDisplayStyleNo` — the WB-087 backfill deliberately skips these rows, by design, because `buildGroupTitle` never touches them)
- problem: rows that fall back to a per-SKU `group_key` (`sku:<partNumber>`, no `DisplayStyleNo`/model survived) get their raw vendor CSV title with no brand prefix — `buildGroupTitle`/`buildTireGroupTitle` only prepend the brand when a real style/model name was extracted. 0 live products hit this path today (verified against the current catalog), so it's latent, but a future feed row that lands here would ship a brandless PDP title, meta description, and (per WB-095) JSON-LD `Product.name`.
- fix: fix in `buildGroupTitle`/`buildTireGroupTitle` (prefix `record.brand` even on the per-SKU fallback path) — not a storefront guard, since the storefront trusts `product.name` as already brand-prefixed (see json-ld.ts's "name already begins with the brand" comment).
- verify: a per-SKU-fallback wheel/tire record's group title starts with its brand; existing per-SKU-fallback fixtures updated; `retitle-wheels.ts`'s skip condition revisited once the title includes the brand.
- refs: — (surfaced during G11 Wave 4 review of WB-095)

### WB-107 · PDP JSON-LD models a single leaf, not the full variant set   [LOW]
- status: todo
- area: storefront/pdp (structured data) — real feature work, needs URL-preselectable variant state first
- evidence: storefront/src/modules/product-detail/components/structured-data/json-ld.ts:114-149 (`productJsonLd` emits one `Product` sourced from `product.leaf`, the single default-rendered variant/size — see `data/pick-default-leaf.ts`)
- problem: WB-095 shipped a correct, honest single-variant `Product` JSON-LD (price/availability sourced from the one leaf the page actually renders, so they can never disagree with the page — a deliberate choice over the prior "cheapest-purchasable-across-everything" heuristic that mismatched 60% of the time). But Google's structurally-correct representation for a multi-variant product (finish × size × bolt-pattern) is `ProductGroup` + `hasVariant`, which this doesn't attempt.
- fix: `ProductGroup`/`hasVariant` JSON-LD listing every purchasable variant — requires the PDP to support URL-preselectable variant state (`?finish=&size=&et=`) so each `hasVariant` entry can carry its own canonical `url`; that URL scheme doesn't exist yet, so this is real feature work, not a JSON-LD tweak.
- verify: Google's Rich Results test recognizes the PDP as a `ProductGroup` with distinct `hasVariant` offers; each variant's JSON-LD `url` round-trips to that exact pre-selected state.
- refs: — (surfaced during G11 Wave 4 review of WB-095)

### WB-108 · DEPLOY GATE — 4 new required storefront env vars must be set before this merge deploys   [MEDIUM]
- status: todo
- area: storefront/deploy (ops action, not a code task)
- evidence: storefront/check-env-variables.js:3-36 (now requires `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_SEARCH_ENDPOINT`, `NEXT_PUBLIC_SEARCH_API_KEY` — the last 4 are WB-095 additions)
- problem: WB-095 made `check-env-variables.js` (invoked from `next.config.js`, so it runs on every build/start) hard-fail when `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_SEARCH_ENDPOINT`, or `NEXT_PUBLIC_SEARCH_API_KEY` is unset — a deliberate honesty fix (previously a mis-set env silently shipped localhost canonicals / an empty catalog), but it means any Railway storefront environment missing one of these 4 vars will fail to build the moment this merge deploys.
- fix: not code — before deploying this merge, confirm all 4 vars are set in every Railway storefront environment (production + any preview/staging environments) that builds from `main`.
- verify: `railway variables` (or the Railway dashboard) shows all 4 vars set in every storefront environment; a build against each environment's config exits 0.
- refs: — (surfaced during G11 Wave 4 review of WB-095; blocks nothing in the merge itself, blocks the NEXT deploy)

### WB-109 · G11 Wave 4 deferred minors — low-priority polish   [LOW]
- status: todo
- area: storefront (middleware, checkout, analytics) — grouped, not urgent
- evidence: middleware matcher (opengraph-image|twitter-image|icon literals, unanchored) ; pre-existing `.*\.(png|jpg|gif|svg)` matcher (soft-404 on a handful of static-asset-shaped paths, not WB-096's regression) ; storefront/src/app/[countryCode]/(checkout)/loading.tsx (plain gray, not WB-styled) ; Buy Now fires `begin_checkout` not `add_to_cart` (WB-096's Plausible funnel) ; the purchase Plausible event can double-count on a hard refresh of the confirmation page
- problem: five small, independently-noted rough edges surfaced across the G11 Wave 4 (WB-095/096) reviews — none blocking, none affecting correctness of the shipped features, all cheap to fix in a future cleanup pass.
- fix: anchor the opengraph-image/twitter-image/icon matcher literals; leave (or tighten) the pre-existing static-asset matcher soft-404 as its own small fix; style the checkout `loading.tsx` to match the rest of the WB chrome; fire `add_to_cart` (not `begin_checkout`) from Buy Now; guard the purchase event against a confirmation-page hard-refresh re-fire (e.g. a sessionStorage/order-id dedupe key).
- verify: each of the 5 items individually checkable — matcher regex anchored, checkout loading state WB-styled, Buy Now's Plausible event name matches Add-to-Cart's, refreshing `/order/confirmed/[id]` doesn't re-fire `purchase`.
- refs: — (surfaced during G11 Wave 4 review of WB-095/WB-096)

---

## G12 · Conversion & completeness features (2026-07-13 UX audit)

### WB-097 · Guest order access — "find my order" page   [MEDIUM]
- status: todo
- area: storefront/order
- evidence: order/confirmed/[id] is a guest's only order artifact; the order email carries no link (→ WB-094); no lookup surface exists
- problem: a guest who loses the confirmation tab has NO route back to their order — not even in principle.
- fix: public /order/lookup (email + order display-id → confirmation view; no enumeration), linked from footer + /contact; pairs with WB-094's email deep link.
- verify: guest re-reaches an order with email + order number; wrong pairs leak nothing.
- refs: [spec §WB-097](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-098 · PDP merchandising completeness — set framing, SKU, stock/ETA at CTA   [MEDIUM]
- status: done
- area: storefront/pdp
- evidence: price row says only "PER WHEEL" while default qty is 4; SKUs never render; lead time lives in hover tooltips only (invisible on touch); InvOrderType (SO/special-order) captured in variant metadata but never surfaced
- problem: the PDP omits the standard wheel-commerce decision info: set price, part number, when-will-it-ship, special-order warnings.
- fix: "$X × 4 = $Y per set" line; copyable SKU row; stock + lead time at the CTA incl. an SO "special order — extended lead time" signal; tire load/speed legend; derived backspacing spec row.
- verify: touch device shows stock/ETA without hover; an SO variant is visibly flagged.
- done: 2026-07-17 — SDD on branch `feat/g12-wave-a-discovery-merch` (G12 Wave A, chunk tip `0a2b0b1`). Storefront-only; surfaces already-fetched data the PDP wasn't showing on both wheel + tire PDPs: a "$X × 4 = $Y per set" row; a copyable SKU row (+ JSON-LD `sku` now the real part number, was the variant id); a lead-time/special-order signal at the CTA; a tire load/speed legend; a derived backspacing spec row (computed from existing fields, no new data source). Caught + fixed in review: an SO (special-order) variant's out-of-stock copy was reading identically to a truly-gone variant — now an honest "special order — contact us" distinct from unavailability — and the copy-SKU "Copied" state stuck across a SKU change (now clears on selection change + its own timer). Gate: storefront vitest 845/118 files, tsc 2-baseline (held).
- refs: [spec §WB-098](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-099 · Brand & style landing pages   [MEDIUM]
- status: done
- area: storefront (new routes on the discovery engine)
- evidence: three surfaces already point at a brand index (nav, footer "All Brands", ShopByBrand "View all"); style presets exist in style-map.ts; the legacy /collections path is being retired (WB-086)
- problem: brands are the site's top navigation concept with no real landing surface; WB-085's repoint is an interim.
- fix: /brands index (live facet + counts) + /brands/[slug] (hero + scoped discovery grid); optional /styles/[slug]; nav repoint; sitemap entries.
- verify: nav Brands → an indexable page listing every live brand; brand page grid matches /store?brands=.
- done: 2026-07-17 — SDD on branch `feat/g12-wave-a-discovery-merch` (G12 Wave A, chunk tip `f483cd3`). Storefront-only; thin reuse of the existing discovery engine: `/brands` index (live facet + counts) + `/brands/[slug]` (hero + scoped grid, slug = the brand-collection handle) via `listBrandCollections` + a brand-tile join helper; `/styles` index + `/styles/[slug]` from the existing `STYLE_DEFS`; a base-path clear-all + `hideBrand` prop on the shared discovery rail so a brand page doesn't re-offer its own facet; repointed the 7 nav/footer/home/breadcrumb surfaces that referenced the WB-085 interim `/store?brands=` path; sitemap entries for both, scoped to wheel-facet brands/styles (parity fix so a tire-only brand/style doesn't sitemap a 404); `robots` noindex added to the shared not-found page, neutralizing soft-404 indexing of bad slugs. Caught + fixed in review: a style preset was OVERRIDING the pinned dimension instead of only default-filling it when empty (now refinable), and the sitemap initially scoped brand/style entries without the wheel-facet gate (fixed for parity with each other). Gate: storefront vitest 845/118 files, tsc 2-baseline (held).
- refs: [spec §WB-099](specs/2026-07-13-ux-completeness-fixes-design.md) ; depends: WB-086 (path retirement), supersedes WB-085's interim repoint

### WB-100 · Availability signals in discovery — in_stock index + badge + facet   [MEDIUM]
- status: done
- area: backend/vendor-sync-search + storefront/discovery
- evidence: neither Meili doc type carries any stock field — a sold-out product is indistinguishable on the grid until its PDP
- problem: shoppers invest clicks in products they can't buy.
- fix: in_stock boolean on both doc types; stock-pass hook re-indexes parts whose flag flipped (or lean on the WB-089 daily reconcile); card OUT-OF-STOCK badge + "In stock only" facet toggle.
- verify: a zero-stock product is visibly marked and excludable on /store and /tires.
- done: 2026-07-17 — SDD on branch `feat/g12-wave-a-discovery-merch` (G12 Wave A, chunk tip `9185f52`). Backend + storefront. Field-widening: the Meili transformer now reads real per-variant inventory (`variants.inventory_items.inventory.stocked_quantity`/`reserved_quantity`, MikroORM `@Formula` lazy props) and a pure `computeInStock` ORs `(stocked-reserved)>0` across non-discontinued variants for both wheel + tire doc types; `in_stock` added to both `filterableAttributes` and `displayedAttributes`; the existing 3h stock-only tick now triggers a full Meili reconcile gated on `updatedCount>0`. Storefront: an OUT-OF-STOCK grid badge (strict `=== false`, so unknown/missing never mis-badges) + an "In stock only" toggle on both discovery rails, threaded through the wheel + tire data layers and cache keys. Caught + fixed in review: an early spike computed in_stock without gating on discontinued variants, the reconcile trigger needed an anti-spam guard, and the badge originally used a falsy check instead of strict `=== false`. The in_stock signal was verified accurate against Store-API ground truth. Gate: backend test:sync 382/6-skip (+17 WB-100 cases: `compute-in-stock`, `stock-reconcile`, `meili-index-settings`/`build-search-document` in_stock cases), full backend jest 581/9-skip, `medusa build` exit 0; storefront vitest 845/118 files, tsc 2-baseline (held). **⚠️ DEPLOY GATE — NOT live on merge alone, hard-ordered: (1) deploy backend (applies the in_stock filterable+displayed Meili settings but does NOT re-index existing docs); (2) TRIGGER A FULL MEILI RECONCILE to backfill in_stock onto every doc (`POST /admin/meilisearch/sync` or a `medusa exec` emitting `meilisearch.sync` — immediate; else the daily `0 4 * * *` cron, ≤24h — the 3h stock tick is NOT reliable here, gated on `updatedCount>0`, a byte-identical feed won't fire it); (3) THEN rebuild/release the storefront. Ordering is a hard gate — storefront-live-before-reconcile false-badges every card OUT OF STOCK and makes "In stock only" return zero (silent — `hitToProduct`'s `in_stock ?? false` under-claim). No DB migration. Dovetails with G11's still-pending WB-087/089 Meili reconcile — one reconcile serves all.**
- refs: [spec §WB-100](specs/2026-07-13-ux-completeness-fixes-design.md) ; depends: WB-089

### WB-101 · Journey connectors — wheels↔tires cross-sell, recently viewed, typeahead   [LOW]
- status: todo
- area: storefront/discovery + storefront/search + storefront/home
- evidence: no affordance connects /store and /tires even in fit mode (vehicle known on both); no recently-viewed surface; the search drawer is submit-only
- problem: multi-product journeys (wheels AND tires for one vehicle) require manual re-navigation; comparison shopping across 1,700 groups has no memory.
- fix: fit-mode cross-link band ("Need tires for these wheels?" → /tires?fit= and inverse); localStorage recently-viewed rail (home + PDP); drawer typeahead (server action → Meili, debounced).
- verify: vehicle-active shopper hops wheels↔tires in one click with fit preserved.
- refs: [spec §WB-101](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-102 · Staggered fitment support (front/rear axles)   [LOW]
- status: todo
- area: backend/wheel-size + storefront/fitment + pdp + cart — XL, needs its own design pass
- evidence: wheel-size by_model raw carries per-axle front/rear data; VehicleFitment flattens it; no axle concept in verdicts, PDP, or cart
- problem: staggered-OEM vehicles (common on performance cars) match wheels/tires on either axle unlabeled; no 2+2 purchase flow.
- fix: per-axle windows/OEM sizes; staggered PDP picker; cart pairing; per-axle verdicts. Spec before build.
- verify: a staggered vehicle sees axle-labeled fitment and can buy a 2+2 set.
- refs: [spec §WB-102](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-103 · Post-purchase self-service — reorder, return request, marketing opt-in   [LOW]
- status: todo
- area: storefront/account + storefront/order + backend (return request wiring)
- evidence: orders page copy already promises returns/exchanges (fixed to honest copy by WB-093); Medusa 2.13.6 ships return machinery unexposed; the newsletter module is never offered at registration
- problem: after the WB-093 copy fix, there is still no actual self-service: no reorder, no return request, no marketing opt-in at the highest-intent moment.
- fix: reorder button (order items → addToCart, dead variants skipped with a note); minimal return-request form → admin; registration marketing-consent checkbox → newsletter module; account-deletion contact path.
- verify: a delivered order can be reordered and a return requested end-to-end in test.
- refs: [spec §WB-103](specs/2026-07-13-ux-completeness-fixes-design.md)

### WB-110 · Special-order products read as blanket OUT OF STOCK on the discovery grid   [MEDIUM]
- status: todo
- area: backend/vendor-sync-search + storefront/discovery
- evidence: WB-100's `computeInStock` treats any SO (`vendor_inv_order_type === "SO"`) variant the same as a true sellout — qty is ~always 0 for SO rows, and SO is ~12.6% of the catalog; the PDP correctly special-cases SO via WB-098's CTA copy ("special order — contact us") but the grid badge/toggle has no equivalent distinction.
- problem: a shopper sees "OUT OF STOCK" on the grid for a product that's actually orderable-via-contact, undercutting the WB-098 PDP messaging and likely suppressing clicks that would have converted.
- fix: index `vendor_inv_order_type` (or a derived `is_special_order` boolean) in Meili alongside `in_stock`; add a distinct "Special order" grid chip/state, visually separate from OUT OF STOCK.
- verify: an SO product's grid card reads "Special order" not "OUT OF STOCK"; the "In stock only" toggle's treatment of SO products is an explicit, documented product decision rather than an accident of the OR-over-variants computation.
- refs: — (surfaced during G12 Wave A review of WB-100)

### WB-111 · `/collections/[handle]` could redirect straight to `/brands/<handle>` now that brand pages exist   [LOW]
- status: todo
- area: storefront (routing) — small, out of WB-099's scope
- evidence: the retired `/collections/[handle]` route currently 301s to `/store?brands=<title>` (WB-086); the collection handle IS the brand handle WB-099's `/brands/[slug]` reads
- problem: the legacy collection-handle redirect lands on a filtered `/store` grid instead of the purpose-built `/brands/<handle>` landing page that now exists — a nicer target that didn't exist when the WB-086 redirect was written.
- fix: repoint the `/collections/[handle]` 301 target from `/store?brands=<title>` to `/brands/<handle>`.
- verify: hitting a legacy `/collections/<handle>` URL 301s to `/brands/<handle>` and renders the brand hero + scoped grid.
- refs: — (surfaced during G12 Wave A review of WB-099); harmless either way, not urgent

### WB-112 · Style-page pinned-dimension rail display doesn't reflect the server-filled preset   [LOW]
- status: todo
- area: storefront/discovery (style pages)
- evidence: `/styles/<slug>` fills the preset's pinned empty dimension server-side (`apply-style-preset.ts`, the WB-099 refinable-not-override fix) but the corresponding rail checkbox renders unchecked because the fill never lands in the URL/query state the rail reads from
- problem: the grid IS correctly filtered to the style preset, but the sidebar visually disagrees with what's actually applied — a shopper can't tell from the rail that the preset is active.
- fix: reflect the server-filled dimension value in the rail's checked state (or the URL) so the UI matches the applied filter; same root cause as the existing accepted "can't clear the pinned dimension to empty" edge.
- verify: opening `/styles/<slug>` shows the preset's pinned dimension pre-checked in the rail, matching the filtered grid.
- refs: — (surfaced during G12 Wave A review of WB-099); cosmetic, accepted edge

### WB-113 · Sub-model vehicle selector — replace the engine-trim axis   [DONE]
- status: done
- area: backend/wheel-size + storefront/search (YMM fitment)
- evidence: the vehicle picker's 4th axis showed wheel-size.com engine "modifications" (1.8 VVT-i) as an optional "Trim"; shoppers identify their car by marketing sub-model (L, LE, LE Eco)
- problem: engine displacement is not how shoppers know their car, and the axis was optional — a user request 2026-07-17.
- fix: replace the engine axis with the mandatory sub-model from wheel-size's `trim_levels` (live-probed: on both `/modifications` and `by_model`); resolve fitment by filtering the broad `by_model` entries by `trim_levels` membership (RAW-cached, one fetch/vehicle); `Base` fallback for vehicles with no trim data; fully replace the engine name.
- done: 2026-07-17 — SDD on branch `feat/wb-113-submodel-selector` (5 tasks + per-task reviews [2× opus] + opus whole-feature review + live smoke; tips 1=`f58552b`, 2=`81aa542`, 3=`85cc88e`, 4=`c7d7e11`). Backend: pure `subModelsForModelYear`/`filterEntriesBySubModel`, `resolveByModel(subModel)` filters a broad `by_model` fetch (RAW cache, key drops the sub-model slot, quota decreases), `listModifications`→sub-model union, routes serve `{ subModels: string[] }` + accept `sub_model`, reverse-fitment reads `trim_levels` (WB-104 honesty preserved). Storefront: mandatory sub-model `<select>` + `Base` fallback + `normalizeStoredSubModel` (old localStorage engine slug → Base, self-heals). Live-verified: Corolla 2019 → `L/LE/LE Eco/SE/XLE/XSE`, `sub_model=LE`→5x100. Gate: backend wheel-size jest 137 + full jest 602/12-skip + medusa build 0; storefront vitest 859/121 + tsc 2-baseline + next build 0.
- **⚠️ DEPLOY IN LOCKSTEP (backend + storefront are separate Railway services): the `/store/vehicle-catalog/modifications` response changed `[{slug,name}]`→`{ subModels: string[] }` and the by-vehicle route param `modification`→`sub_model` — a version skew breaks the dropdown/fitment. No DB migration; stale engine-mod-keyed `wheel_size_fitment` rows re-resolve on demand + via the warm cron; existing localStorage vehicles' old engine slug collapses to `Base` (broad fallback) and self-heals on re-pick.**
- refs: [done/specs/2026-07-17-wb-113-submodel-selector-design.md](../done/specs/2026-07-17-wb-113-submodel-selector-design.md) · [done/plans/2026-07-17-wb-113-submodel-selector.md](../done/plans/2026-07-17-wb-113-submodel-selector.md)

### WB-114 · Tire OEM sizes not narrowed by the selected sub-model   [LOW]
- status: todo
- area: backend/wheel-size (fitment)
- evidence: `fitmentForSubModel` (`service.ts`) narrows wheel bolt/bore/windows by the picked sub-model (WB-113) but passes the FULL unfiltered `by_model` body to `extractOemTireSizes`/`extractOemTires`, so a vehicle's OEM tire sizes are the union across ALL sub-models (live-confirmed: Corolla LE and XSE return the same `oemTireSizes`, though LE Eco is stock 195/65R15 vs XSE 205/55R16).
- problem: a new asymmetry from WB-113 — wheels narrow by sub-model, tire OEM sizes don't. It's a permissive superset (never hides a fitting tire, never mis-sells a wheel), but not sub-model-accurate.
- fix: pass the sub-model-filtered subset (`{ data: entries }`) rather than `body` to the two OEM-tire extractors, with a test; keep the cache's derived columns as the sub-model-agnostic Base snapshot for reverse-fitment + the warm cron.
- verify: `sub_model=LE` returns LE's OEM tire sizes, not the union across trims.
- refs: — (surfaced during the WB-113 whole-feature review); permissive superset, not urgent
