# Launch-readiness fixes — Design (G10: WB-077 … WB-083)

> Status: **draft — awaiting client decisions D1–D4, then per-cluster plans**. Date: 2026-07-10.
> Findings source: [future/plans/2026-07-10-launch-readiness-audit.md](../../future/plans/2026-07-10-launch-readiness-audit.md)
> (§1 fitment F1–F5, §2 bugs B1–B12, §3 P0–P2). Governing dashboard: [docs/STATUS.md](../../STATUS.md)
> · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md) (group **G10**).
> Convention: each cluster below is sized to become ONE plan in `docs/in-progress/plans/` and ship
> as one branch, in the order listed (WB-077 first — it is the user-visible product promise).

---

## 0. Decisions needed before/while building (client)

| # | Cluster | Question | Recommendation (default if unanswered) |
|---|---|---|---|
| D1 | WB-077 | Should fit-mode discovery **include** aggressive ("check"-tier) fitments with a badge, or hide them behind a "show aggressive" toggle? | **Include + badge.** It's how Custom Offsets / Fitment Industries merchandise; hiding them re-creates the under-claiming complaint. |
| D2 | WB-080 | Stripe capture: automatic capture at authorization (`capture: true`), or keep manual capture as an explicit admin/fulfillment runbook step? | **Automatic capture.** No ops discipline exists yet to guarantee capture within Stripe's ~7-day auth window; uncaptured = unpaid. |
| D3 | WB-080 | US sales tax: manual tax region + flat rates in admin now, or integrate a provider (TaxJar/Avalara)? | **Manual now** (unblocks launch), provider as follow-up once volume justifies it. Needs the merchant's nexus states. |
| D4 | WB-078 | Account "change password": authenticated in-place change, or replace the dead form with a "send me a reset email" button reusing the reset flow? | **Reset-email button.** One flow to build/test; in-place change needs a custom auth route. |

---

## 1. WB-077 · Fitment truth v2 — three-tier verdict + window integrity   [HIGH]

Fixes audit §1 (F1–F5): real-world-fitting wheels render "doesn't fit". Two data bugs + one design
decision + two small gates. **Backend-first ordering** (the verdict consumes what normalize produces).

### 1.1 Backend — windows that describe the car (F1, F2)

**`normalizeByModel` merges ALL trims** ([normalize.ts](../../../backend/src/modules/wheel-size/normalize.ts)):

- Today: `const entry = raw?.data?.[0]` → everything (patterns, bore, windows) from one arbitrary trim.
- New: iterate every `data[]` entry —
  - `canonicalBoltPatterns`: **union** across entries (deduped; a year/model that genuinely mixes
    patterns across trims will match either — acceptable: bolt is re-checked per product anyway, and
    a trim-specific lookup narrows it).
  - `hubBoreMm`: if all non-null values agree (±0.05 mm) → that value; **if trims disagree → `null`**
    (the bore axis becomes uncheckable rather than wrong; log a warn). Rationale: picking max
    manufactures false negatives for lower trims, picking min manufactures over-claims.
  - windows: `windowFrom` over rims of **every entry**, and — F2 — over **stock AND aftermarket**
    rims (drop the `is_stock === false` filter; the factory size must never be out-of-window).
- When a trim IS selected the API already narrows `data` to that trim — same code path, no branch.
- `oemTireSizes`/`oemTires` extraction is unchanged (already reads `is_stock === true` across entries).

**Cache re-key (deploy-safe):** append a version to `buildFitmentCacheKey`
([cache-key.ts](../../../backend/src/modules/wheel-size/cache-key.ts)) — `[…, "v2"].join("|")` — so
every cached single-trim row is orphaned and re-warms on next lookup (same soft re-warm mechanism as
WB-072 A1; optional truncate of `wheel_size_fitment` for cleanliness). Warm cron's `parseCacheKey`
updated in lockstep.

### 1.2 Shared — the three-tier verdict (F3, F4, F5)

New status set, threaded everywhere a fit answer renders:

```ts
type FitTier = "fits" | "check" | "no-fit" | "unknown"
```

- **`fits`** — bolt ∩ AND bore clears AND ≥1 variant with diameter+width+offset all in-window
  (per-variant conjunction — WB-072 S1 semantics retained).
- **`check`** *(new)* — bolt ∩ AND bore clears, but NO variant is fully in-window. Copy:
  *"Aggressive fitment — outside the typical range for your {vehicle}. Verify clearance before
  ordering."* This is the tier the entire complaint lives in.
- **`no-fit`** — bolt patterns don't intersect (both sides non-empty), OR every bolt-matching
  variant's bore is genuinely below the hub (beyond tolerance). Only physical impossibilities.
- **`unknown`** — vehicle has no pattern data (existing S5) **or the product has none** (F5 —
  today's false "Bolt pattern does not match" on BLANK-pattern products).

**Bore tolerance (F4):** one shared constant `BORE_TOLERANCE_MM = 0.2`;
`boreClears(bore, hub) = bore == null || hub == null || bore >= hub - BORE_TOLERANCE_MM`.
Lives in three places that must stay lockstep (storefront `fits-vehicle.ts` / `fit-view.ts`,
backend `reverse-fitment.ts`) → add a golden fixture (`fixtures/bore-clearance-golden.json`)
asserted in both apps, same pattern as the finish/bolt-pattern goldens (WB-030).

**Touched decision functions (all pure, all unit-tested):**

| Function | Change |
|---|---|
| [`fitsVehicle`](../../../storefront/src/lib/fitment/fits-vehicle.ts) | returns `FitTier` + reasons; window-miss → `check` not `no-fit`; empty `pPats` → `unknown` |
| [`variantFitsVehicle`](../../../storefront/src/lib/fitment/product-has-fitting-variant.ts) | becomes `variantFitTier(v, vehicle): "fits" \| "check" \| "no"`; keep `variantFitsVehicle = tier === "fits"` as a thin strict wrapper so existing strict callers don't change semantics silently |
| `productHasFittingVariant` | becomes `productFitTier(variants, vehicle)` = best tier across variants; strict wrapper retained |
| [`buildFitView`](../../../storefront/src/modules/product-detail/data/fit-view.ts) | sizes/offsets carry a `tier`; fit-mode keeps `fits` first and **shows** `check` options with the aggressive badge instead of filtering them out (D1); `hasFit` → `bestTier` |

### 1.3 Surfaces

- **PDP band + purchase chip** ([fitment/index.tsx](../../../storefront/src/modules/product-detail/components/fitment/index.tsx),
  [purchase-panel.tsx](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx)):
  4 visual states — FITS (orange) / CHECK FIT (amber, new copy) / DOESN'T FIT (only bolt/bore) /
  UNKNOWN (informational). Band copy explains *what* is outside the range (reuse `reasons`).
- **Discovery fit-mode** ([get-products.ts](../../../storefront/src/modules/discovery/data/get-products.ts)):
  the Meili candidate query is already bolt-pattern-scoped (unchanged); the per-variant post-filter
  keeps `fits` + `check` (D1), sorts `fits` first, drops only `no`; card badge shows FITS or CHECK
  FIT accordingly ([fit-badge.tsx](../../../storefront/src/modules/discovery/components/grid/fit-badge.tsx)).
  `totalCount`/`isCapped` semantics unchanged.
- **Reverse "confirmed models" list** ([reverse-fitment.ts](../../../backend/src/modules/wheel-size/reverse-fitment.ts)):
  stays **strict** (`fits` tier only) — "confirmed" must keep meaning in-window — but adopts the
  bore tolerance so it can't contradict the band on the bore axis.
- **Checkout `FitmentVerifiedCard`** (B12): reword to what the data supports ("Fitment checked
  against wheel-size.com specs for your {vehicle}") and render only when the cart actually contains
  a `fits`/`check`-tier item for the active vehicle; drop "Confirmed by our team".

### 1.4 Testing / verify / deploy

- Re-add the audit's 9 repro scenarios (audit §1.3) as regression tests asserting the **fixed**
  behavior: multi-trim union (jest `test:fitment`), OE-replica → `fits`, 20x10 ET-19 → `check` (not
  `no-fit`), bore 78.0-vs-78.1 → clears, empty product patterns → `unknown`, order-independence of
  `data[]`, control in-window → `fits`.
- Verify: on a Silverado-class vehicle with "Any trim", a 20x10 ET-19 wheel PDP shows CHECK FIT and
  appears in fit-mode discovery with the badge; an OE-size wheel shows FITS; a 5x114.3-only wheel
  still shows DOESN'T FIT.
- Deploy: backend first (normalize + cache-key v2 + reverse tolerance) → optional
  `wheel_size_fitment` truncate → storefront rebuild (verdict + surfaces). No migration. No Meili
  change (windows travel via `fitb/fitd/fitw/fito` URL params, unchanged).

---

## 2. WB-078 · Transactional email + account recovery   [HIGH]

Fixes audit §3 P0 #2–#3. Today: **zero** emails send in prod (Resend env unset), `replyTo`
`info@example.com` hardcoded, only 2 templates exist, **no password reset at all**, and the account
change-password form is a no-op.

### 2.1 Config & hygiene
- Ops: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` on the Railway backend. Add both to
  `backend/.env.template` (they're absent — template drift, audit P0 #8).
- New optional env `EMAIL_REPLY_TO`; both subscribers use it when set, **omit `replyTo` otherwise**
  — delete the `info@example.com` literals ([order-placed.ts:24](../../../backend/src/subscribers/order-placed.ts#L24),
  [invite-created.ts:25](../../../backend/src/subscribers/invite-created.ts#L25)). (Supersedes the
  reply-to half of WB-031.)
- Rebrand `invite-user.tsx` ("invited to Medusa" + Medusa logo → Wheel Builds).

### 2.2 Shipping confirmation (new template + subscriber)
- Follow the module README 4-step recipe: `templates/shipping-confirmation.tsx` (order id, items,
  tracking numbers/labels when present), `EmailTemplates` enum entry, `generateEmailTemplate` case.
- `src/subscribers/shipment-created.ts` on `shipment.created`: resolve the fulfillment → order +
  customer email via `query.graph` on the **global container** (the off-request container gotcha —
  same pattern as `order-placed.ts`), then `createNotifications`. Honor `no_notification`.

### 2.3 Password reset (backend + storefront)
- Backend: `src/subscribers/auth-password-reset.ts` on Medusa v2's `auth.password_reset` event —
  payload carries `{ entity_id (email), token }`. New `password-reset.tsx` template linking to
  `${STOREFRONT_URL}/us/reset-password?token=…&email=…`. New required-for-this-feature env
  `STOREFRONT_URL` (add to `.env.template`).
- Storefront: "Forgot password?" link on the login form → `/[countryCode]/forgot-password` (email
  form → `sdk.auth.resetPassword("customer", "emailpass", { identifier: email })`; always render
  "if that account exists, an email is on its way" — no account enumeration). New
  `/[countryCode]/reset-password` page: reads `token`+`email` from the URL, posts the new password
  via `sdk.auth.updateProvider("customer", "emailpass", { email, password }, token)`, then routes to
  login with a success toast. Server Actions **return error strings** (register/login React #31
  lesson — never throw, never return objects).
- Account "change password" (D4 default): replace the dead form
  ([profile-password/index.tsx:19](../../../storefront/src/modules/account/components/profile-password/index.tsx#L19))
  with a "Send password reset email" button reusing the same action.

### 2.4 Verify
- Dev: `pnpm email:dev` renders all 4 templates; trigger each subscriber against a dev DB.
- Live: place a test order → confirmation email; fulfill+ship in admin → shipping email; full
  forgot→reset→login roundtrip; reply-to shows the configured address.

---

## 3. WB-079 · Bug batch (audit B1–B11)   [HIGH]

One branch, one commit per bug, each with a failing-test-first where a pure seam exists.

| Bug | Fix spec | Verify |
|---|---|---|
| **B1** tire orphaned-`?fit` (HIGH) | Mirror the wheel twin: give [tire fitment-sync](../../../storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx) the `shouldStripFit` path over `FIT_PARAM_KEYS = ["fit","fitl","fits"]` (reuse [strip-fit.ts](../../../storefront/src/modules/discovery/components/fitment-sync/strip-fit.ts) — it's already pure + tested); ALSO show a removable "Fits:" chip in [tire active-chips](../../../storefront/src/modules/tire-discovery/components/active-chips/index.tsx) whenever fit params are present, even with `active == null`. The "garage loads async" rationale is dead post-WB-076 (garage is synchronous). | Clear vehicle on `/tires` → params strip, full catalog; switch to a no-OEM-data vehicle → strip + existing toast now truthful. |
| **B2** prod-redacted checkout errors (MED) | Convert throw-to-user paths to **returned** error strings: `placeOrder` ([cart.ts:334](../../../storefront/src/lib/data/cart.ts#L334)) returns `{ error: string } \| never` (redirect on success), `setShippingMethod` (:195) and `initiatePaymentSession` (:215) same shape; callers ([payment-button/index.tsx:103](../../../storefront/src/modules/checkout/components/payment-button/index.tsx#L103), shipping, payment) read `.error` instead of `.catch(err.message)`. Keep `medusaError` for genuinely-unexpected paths. | In a prod build, force `cart.complete` to return an error → customer sees the WB-071 reassurance copy, not "an unexpected error occurred". |
| **B3** cart never linked to customer (MED) | Pass `await getAuthHeaders()` to `sdk.store.cart.create` ([cart.ts:37](../../../storefront/src/lib/data/cart.ts#L37)); on login success (`lib/data/customer.ts`) transfer any existing guest cart to the customer (`POST /store/carts/:id/customer` via `sdk.store.cart.transferCart(cartId)`), then `revalidateTag("cart")`. | Log in → add to cart → checkout → order appears in `/account/orders`; guest-cart → login → cart survives and order links. |
| **B4** finish-switch bolt/grid desync (HIGH, prior-audit #2) | In [hero/index.tsx](../../../storefront/src/modules/product-detail/components/hero/index.tsx): derive `boltPatternOptions` from the SELECTED finish's variants (not product-wide, :66) and key the re-snap effect (:83-88) on finish change so the selected bolt pattern is always offered by the visible size grid. Pure seam: extract `boltPatternsForFinish(finishOption)` + test. | Switch finish on a multi-pattern wheel → chip + grid + selected variant stay consistent; the wrong-pattern add-to-cart repro fails. |
| **B5** SFTP zero-files run "completed" (MED, prior #17) | [vendor-sync/service.ts:207-213](../../../backend/src/modules/vendor-sync/service.ts#L207): no matched feed file → `status: "failed"`, `error_message: "no feed file matched <pattern>"` (fail-loud, consistent with WB-041). | test:sync case: empty SFTP listing → run `failed`; cron surfaces it (feeds WB-081 alerting). |
| **B6** purge-products no guard (MED, prior #19) | Require `{ confirm: "<DATABASE_URL host>" }` in the POST body (same `--confirm-host` contract as the dev-wipe scripts); 400 otherwise. | Bare POST → 400; correct host string → purge proceeds. |
| **B7** literal `0` at empty payment methods (LOW) | [payment/index.tsx:150](../../../storefront/src/modules/checkout/components/payment/index.tsx#L150): `availablePaymentMethods.length > 0 &&`. | Prod-mode with only manual provider → no stray "0". |
| **B8** PDP crash on variant-less product (LOW) | Guard `visibleSizes.length === 0` in [hero/index.tsx:121](../../../storefront/src/modules/product-detail/components/hero/index.tsx#L121) → render an "unavailable / no options" state; make `pickDefaultSize` total (`sizes[0] ?? null`). | Admin-created variant-less product renders, no client error. |
| **B9** middleware `.includes` country match (LOW) | [middleware.ts:100](../../../storefront/src/middleware.ts#L100): exact `=== countryCode` comparison. | `/customer` redirects to `/us/customer` instead of 404. |
| **B10** duplicate qty option (LOW) | [cart item/index.tsx:96](../../../storefront/src/modules/cart/components/item/index.tsx#L96): drop the unconditional trailing `<option value={1}>`. | Qty select lists each number once; no React key warning. |
| **B11** admin `colSpan` tsc error (LOW) | [vendor-sync/page.tsx:169](../../../backend/src/admin/routes/vendor-sync/page.tsx#L169): spread-cast the prop or use a plain `<td>` — backend `tsc` reaches 0 errors and becomes a usable gate. | `npx tsc --noEmit` (backend) exits 0. |

---

## 4. WB-080 · Money integrity — Stripe capture, live cutover, US tax   [BLOCKER]

Fixes audit §3 P0 #4–#6. Mostly ops + one config line; blocks real revenue.

- **Capture (D2, default automatic):** add `capture: true` to the Stripe provider options in
  [medusa-config.js](../../../backend/medusa-config.js) (payment plugin block). If the client insists
  on manual review, instead write the capture step into a fulfillment runbook doc + admin training,
  and add a daily "uncaptured authorizations > 5 days old" warning (WB-081 watchdog can carry it).
- **Live cutover runbook** (ops checklist, no code): live `sk_live_…` on backend + live webhook
  endpoint `{BACKEND_URL}/hooks/payment/stripe_stripe` + its `STRIPE_WEBHOOK_SECRET`; `rm -rf
  backend/.medusa/server` before restart (stale-config trap); live `pk_live_…` as
  `NEXT_PUBLIC_STRIPE_KEY` + **storefront rebuild**; then run the two guarded prod scripts that are
  still pending — `strip-manual-payment.ts` (unpaid-order hole) and `update-shipping-prices.ts`
  (free-≥$199 rule) — and smoke $150→$10 / $250→$0 shipping + Manual absent from checkout.
- **US tax (D3, default manual):** create the US tax region + rates in admin for the merchant's
  nexus states (seed covers 7 EU countries only — US orders currently compute $0 tax). Document the
  decision + rates in the runbook; provider integration (TaxJar/Avalara) stays a follow-up item.
- Verify: a live-mode test order charges (not just authorizes) the card, computes the configured
  tax, applies the right shipping price, and cannot be placed via Manual payment.

---

## 5. WB-081 · Ops hardening — alerting, resilience, provisioning, legal   [MEDIUM]

Fixes audit §3 P0 #7–#8 and P1 #10–#12, #14.

- **Vendor-sync alerting:** new backend subscriber on the existing `vendor-sync.*` run-completion
  events (or a status-transition check in the run subscriber): when a run lands `failed` /
  `exhausted` / `partially_failed`, send an ops email via the Notification module (new
  `vendor-sync-alert` template; recipient env `OPS_ALERT_EMAIL`). Plus a daily watchdog job
  (`src/jobs/vendor-sync-watchdog.ts`, cron `0 13 * * *`): no `completed` FULL run in >24h per
  enabled vendor → same alert. Global-container rules apply (cron/subscriber, never the module
  cradle).
- **Middleware region fallback:** wrap `getRegionMap()`'s backend fetch
  ([middleware.ts:22-30](../../../storefront/src/middleware.ts#L22)) in try/catch → on failure serve
  `NEXT_PUBLIC_DEFAULT_REGION` (`us`) instead of 500ing every page on a cold edge instance.
- **Env-template drift:** add `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` + `NEXT_PUBLIC_STRIPE_KEY` to
  `storefront/.env.local.template`; add `RESEND_*` (done via WB-078) + comment `VENDOR_SYNC_DEV_MAX_ROWS`
  / `VENDOR_ALLOW_SAMPLE_FEED` OUT of `backend/.env.template` defaults with a loud "never in prod"
  note (the row cap silently guts a prod catalog).
- **Prod env hygiene (ops):** rotate `JWT_SECRET`/`COOKIE_SECRET` off `supersecret`; verify CORS trio
  includes the storefront domain; verify `VENDOR_SYNC_DEV_MAX_ROWS`/`VENDOR_ALLOW_SAMPLE_FEED` unset.
- **Legal/support surface:** static pages under `(main)`: `/contact` (order Help already links to
  it — currently 404s), `/returns`, `/privacy`, `/terms`, `/shipping` — WB copy through the design
  system; fix the footer `href="#"` and point order-Help + footer links at them. (Stripe live mode
  + ad networks expect these to exist.)
- **Demo catalog purge (ops):** delete the 4 seeded apparel products in admin (purge-products skips
  non-vendor products by design); then drop the three demo S3 hosts from `next.config.js`
  remotePatterns.
- Verify: kill the SFTP credentials on a dev run → alert email arrives; stop the backend → the
  storefront still serves `/us` pages from a cold start; a fresh clone provisioned from the two
  templates boots both apps; `/contact` renders; demo products gone from `/store`.

---

## 6. WB-082 · SEO + observability   [MEDIUM]

Fixes audit §3 P2 #16–#17. No SEO discovery surface and zero telemetry today.

- **`app/robots.ts`:** allow all; disallow `/api/`, `/order/`, `/account/`, `(checkout)` routes;
  point at the sitemap.
- **`app/sitemap.ts`:** home, `/store`, `/tires`, categories/collections, and all product handles —
  read handles from Meilisearch (`meili.index.getDocuments` paginated, fields `handle,updated_at`,
  both `product_type`s) rather than hammering the Store API; prefix with the default country code;
  `revalidate` daily. ~2,700 URLs — single sitemap file is fine (<50k limit).
- **Error surfaces:** `error.tsx` under `(main)` and `(checkout)` + root `global-error.tsx`,
  WB-styled ("Something broke — try again / back to catalog"), so prod failures aren't the unstyled
  Next default.
- **Error tracking + analytics (needs a client pick, default: Sentry + Plausible):** Sentry in both
  apps (`@sentry/nextjs`, Medusa via `instrumentation`/node SDK) gated on `SENTRY_DSN`; lightweight
  analytics script gated on `NEXT_PUBLIC_ANALYTICS_DOMAIN` — zero vendor lock in the components,
  everything env-gated OFF by default so this ships inert.
- Verify: `curl /robots.txt` + `/sitemap.xml` (spot-check a wheel + a tire URL); throw in a dev page
  → styled error boundary; DSN set → a forced error lands in Sentry.

---

## 7. WB-083 · Docs truth sweep #2   [LOW]

Fixes audit §3 "doc drift" (post-WB-075 accumulation). Docs-only branch.

- Move the 9 stale files in `docs/in-progress/` (tire arc WB-005/WB-063 — all shipped + LIVE) to
  `docs/done/`, flip their headers, and update the STATUS pillar / BACKLOG `refs:` paths that point
  at `in-progress/`.
- Strike the stale "unpushed"/"local branch" claims in STATUS Active-work entries (everything
  through WB-076 is pushed; the auth-headers hotfix is merged as `ec8c587`).
- Correct the WB-069 "every one of the 76 findings is fixed" over-claim: annotate with the ~16
  unreferenced findings (now tracked via WB-077/WB-079 + the §2-tail list in the audit doc).
- Annotate WB-072's deploy instruction (`backfill-garage-bore.ts`) as **mooted by WB-076** (the
  customer-vehicle module is unregistered; the script cannot run).
- `storefront/CLAUDE.md`: fix "FEATURED BLOCKS … remain editorial/placeholder", "`fitment: []`
  (Spec 2)", and the upcoming-garage framing (all contradict shipped reality); refresh the tsc
  baseline note if WB-079 B11 lands (backend 0).
- Run `/doc-review` as the gate.

---

## 8. Interfaces & isolation (cross-cluster)

Pure, unit-testable seams (build these first in each cluster):
- `normalizeByModel` multi-trim merge (WB-077) — jest, no API calls.
- `FitTier` decision trio: `fitsVehicle` / `variantFitTier` / `buildFitView` (WB-077) — vitest,
  golden-shared bore tolerance.
- `shouldStripFit` reuse for tires (WB-079 B1) — already pure/tested, only the wiring is new.
- Checkout action result shapes (WB-079 B2) — typed `{ error?: string }` returns, component-level
  rendering tested by existing patterns.
- Email templates (WB-078) — react-email render tests + `pnpm email:dev` visual check.

I/O & config edges (review-heavy, test-light): Stripe provider options, tax region setup, Railway
env, subscribers (global-container rule), middleware fallback, sitemap adapter.

## 9. Risks & sequencing

1. **WB-077 changes the meaning of "fits" on every surface at once** — mitigate: land the pure
   verdict functions + goldens first, then convert surfaces one commit each; the strict wrappers
   (`variantFitsVehicle`) keep unconverted callers behaving as today until deliberately switched.
2. **Cache re-key quota cost** (WB-077): one wheel-size API call per active vehicle on next lookup —
   bounded, same as WB-072 A1; the daily ceiling (5000) dwarfs it.
3. **B3 cart transfer touches login** — the auth path burned us before (React #31, un-awaited
   headers); keep the transfer failure non-fatal (log + continue) so login never breaks on a cart
   hiccup.
4. **Order:** WB-077 → WB-078 → WB-079 → WB-080 (ops-heavy, can interleave) → WB-081 → WB-082 →
   WB-083 last (re-baselines the docs after everything above moves the counts).
