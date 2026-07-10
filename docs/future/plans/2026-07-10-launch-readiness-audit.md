# Launch-readiness audit + fitment false-negative root cause — findings & next steps

> Status: **findings logged** (no code changed by this audit). Date: 2026-07-10.
> Method: 1 root-cause investigation (systematic debugging, repro'd with unit tests that were run and
> then removed) + 3 parallel audit passes (docs completeness, deployment readiness, general bug sweep;
> storefront `tsc` re-run at 5-error baseline, backend `tsc` 1 error, all 629 unit tests passing).
> Prior art: [2026-07-06 audit findings](2026-07-06-audit-remediation-theme.md) (G9/WB-069).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](BACKLOG.md)

---

## 1. THE FITMENT BUG (user-reported): "wheels fit the car in real life, the site says they don't"

**Confirmed. It is real, systematic, and has one root design decision plus two data bugs behind it.**
Every mechanism below was reproduced with unit tests against the actual code (backend jest
`test:fitment` + storefront vitest — 9 scenario tests, all demonstrating the behavior described;
test files were removed after the investigation so the repo doesn't carry tests that assert bugs).

### 1.1 Root cause chain

The verdict every fitment surface renders (PDP band/chip, discovery `?fit=` filter, confirmed-models
list) is: **bolt pattern ∩** AND **wheel bore ≥ hub bore** AND **one variant whose diameter AND width
AND offset all fall inside the vehicle's "spec windows"** — where *outside the window = hard
"doesn't fit"* ([fits-vehicle.ts:71](../../../storefront/src/lib/fitment/fits-vehicle.ts#L71),
[product-has-fitting-variant.ts:49-53](../../../storefront/src/lib/fitment/product-has-fitting-variant.ts#L49),
[fit-view.ts:57-71](../../../storefront/src/modules/product-detail/data/fit-view.ts#L57)).
The windows come from wheel-size.com. Three problems stack:

**F1 — HIGH (data): the windows come from ONE ARBITRARY TRIM.**
The YMM drawer's trim selector defaults to **"Any trim"** and is not required
([ymm-pane.tsx:361-380](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L361)).
With no trim, wheel-size.com `by_model` returns one entry **per trim**, and `normalizeByModel` reads
only `raw.data[0]` ([normalize.ts:25](../../../backend/src/modules/wheel-size/normalize.ts#L25)) —
so the bolt patterns, hub bore, and all three windows belong to whichever trim the API happens to
list first. Repro (jest, realistic two-trim F-150 body): windows came out `17–18"` although the same
year supports factory 20–22s on other trims; **reversing the array order flipped the verdict for the
same car**. The trim-retry fallback in
[service.ts:228-233](../../../backend/src/modules/wheel-size/service.ts#L228) (unresolvable trim slug
→ retry without trim) funnels into the same `data[0]` problem.

**F2 — HIGH (data): factory/stock sizes are EXCLUDED from the windows.**
`windowFrom` only reads `is_stock === false` (aftermarket-option) rims
([normalize.ts:46](../../../backend/src/modules/wheel-size/normalize.ts#L46)). Repro: an OE-replica
of the exact wheel the truck left the factory on (17x7.5 ET44, correct bolt pattern, correct bore)
returns **"no-fit"** because ET44 / 7.5" sits outside the aftermarket-options min/max. Side effect:
when `data[0]` has *no* aftermarket entries the windows are `null` and **everything** passes — the
strictness of the whole system depends on arbitrary response ordering.

**F3 — HIGH (design): "outside the window" renders as *disproven*, not *aggressive/unverified*.**
wheel-size.com windows are conservative recommended ranges. This store's catalog (WheelPros: wide,
negative-offset truck wheels) is disproportionately *outside* those windows **by design** — a 20x10
ET-19 on a Silverado 1500 is one of the most common real-world setups and physically bolts on, yet
the site renders a hard "This wheel's size or offset is outside your vehicle's spec range" and drops
it from fit-mode discovery. Repro: 20x10 ET-19 and 22x9 ET+28 (dealer-installed 22s exist) both →
`no-fit` / excluded from the grid. Industry sites (Custom Offsets, Fitment Industries) treat
bolt+bore as the hard gates and size/offset as *guidance tiers* ("OE fit" / "aggressive — verify
clearance"). Note the history: before 2026-07-01 the site **over**-claimed (bolt-pattern-only =
"CONFIRMED FIT"); WB-072 "fitment truth" (merged 2026-07-07) swung it to hard under-claiming. The
honest answer is in the middle: a three-tier verdict.

**F4 — MEDIUM (data noise): knife-edge bore comparison.**
`bore >= hub` is exact ([fits-vehicle.ts:45](../../../storefront/src/lib/fitment/fits-vehicle.ts#L45),
[fit-view.ts:29-30](../../../storefront/src/modules/product-detail/data/fit-view.ts#L29)). Repro: feed
says 78.0, wheel-size says hub 78.1 → hard no-fit on an otherwise perfect wheel. 0.1 mm is inside
both sources' rounding error.

**F5 — LOW (bug): a product with no parseable bolt pattern claims "Bolt pattern does not match".**
WB-072 S5 added the `unknown` verdict for a *vehicle* with no data, but a *product* whose
`boltPatternsCanonical` is empty (vendor "BLANK" rows) still falls through to `no-fit` with a
factually false reason ([fits-vehicle.ts:40-41](../../../storefront/src/lib/fitment/fits-vehicle.ts#L40)).
Should be `unknown` symmetrically.

Not guilty (checked and cleared): the bolt-pattern canonicalizer (golden vectors cover the real
vendor dual-drill format `6X135/5.5`), the dollars/cents price split, the fit-mode variant fetch
(WB-074 D4 honest-empty behavior is correct), and the WB-072 per-variant conjunction itself (the
control test passes an in-window wheel).

### 1.2 Recommended fix (in order)

1. **F3 first — introduce a three-tier verdict** (smallest change, biggest honesty win):
   `fits` (in-window) / **`check` ("MAY FIT — aggressive fitment, verify clearance")** when bolt+bore
   pass but size/offset is outside the window / `no-fit` **only** when bolt pattern mismatches or the
   bore genuinely can't clear. Surfaces: `fitsVehicle`, `variantFitsVehicle`,
   `buildFitView` (keep `check` variants visible with a badge instead of filtering them out), the
   discovery fit-mode post-filter (include `check` results, badge them, or offer a "strict" toggle),
   PDP band/chip copy. This directly answers the user complaint.
2. **F1 — make the windows describe the car, not `data[0]`**: when no trim is chosen, merge across
   ALL `data[]` entries (union of bolt patterns; min/max of windows across trims; hub bore = the
   value when consistent, else null + `unknown` handling). When a trim IS chosen, current behavior is
   already correct (the API narrows to that trim).
3. **F2 — include `is_stock: true` rims in `windowFrom`** (union stock + aftermarket). The factory
   size must never read as no-fit.
4. **F4 — tolerance on the bore gate**: treat `bore >= hub - 0.2mm` as clearing (or compare rounded
   to 1 decimal). Keep genuinely-smaller bores as hard no-fit.
5. **F5 — symmetric `unknown`** when `product.boltPatternsCanonical` is empty.
6. Re-add the investigation scenarios as *regression tests asserting the fixed behavior* (the 9
   scenarios are listed in §1.3; during the investigation they passed asserting the buggy behavior).
7. Deploy tail: after F1/F2 land, truncate `wheel_size_fitment` (or bump the cache-key format) so
   cached single-trim windows re-warm; storefront rebuild for the verdict changes.

**Client decision needed for F3:** whether fit-mode discovery should *include* aggressive fitments
(badged) or hide them behind a toggle. Recommendation: include + badge — that is how the comparable
retailers merchandise, and it maximizes sellable surface while staying honest.

### 1.3 Repro scenarios (all verified 2026-07-10)

| # | Scenario | Current result |
|---|---|---|
| 1 | Two-trim `by_model` body, no trim chosen — windows from `data[0]` only | 20x9 ET18 (factory size on trim 2) = no-fit |
| 2 | Same body, trims reversed | verdicts flip for the same car |
| 3 | `data[0]` has no aftermarket rims | windows null → everything passes (inconsistent strictness) |
| 4 | Silverado windows 17–20/8–9/ET0..31; wheel 20x10 ET-19 (common real setup) | hard no-fit |
| 5 | Same vehicle; 22x9 ET28 (dealer 22s exist) | no-fit + dropped from fit-mode grid |
| 6 | Hub 78.1, feed bore 78.0 (rounding noise) | no-fit "Wheel bore is smaller…" |
| 7 | OE-replica 17x7.5 ET44 vs windows built from aftermarket-only rims | no-fit (the factory wheel!) |
| 8 | Product with empty `boltPatternsCanonical` | no-fit "Bolt pattern does not match" (should be unknown) |
| 9 | Control: in-window wheel, correct pattern + bore | fits ✓ |

To quantify against live data (read-only; not run during this audit — prod-DB access wasn't
authorized): compare `wheel_size_fitment.{diameter,width,offset}_window` rows against the
distribution of `product_variant.metadata->>'offset_mm' / 'wheel_width_in' / 'wheel_diameter_in'`,
and count in-window variants per cached vehicle. Expect a large excluded share for trucks.

---

## 2. Other bugs found (verified in code, newest first)

| # | Sev | Where | What |
|---|---|---|---|
| B1 | HIGH | [tire-discovery/components/fitment-sync/index.tsx:36](../../../storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx#L36) | Tire discovery never strips orphaned `fit`/`fitl`/`fits` params (the wheel twin got the WB-073 G10 strip; the tire rationale is obsolete post-WB-076). Clear/switch vehicle on `/tires` → the grid stays silently filtered by the old car's OEM sizes, with **no visible chip** to remove it ([active-chips/index.tsx:36](../../../storefront/src/modules/tire-discovery/components/active-chips/index.tsx#L36) hides the chip when `active == null`). Was already a known FU ("tire orphaned-`?fit`") — now bumped by WB-076's synchronous garage + CLEAR button. |
| B2 | MED | [lib/data/cart.ts:334-338](../../../storefront/src/lib/data/cart.ts#L334) (also :195, :215) | `placeOrder`/`setShippingMethod`/`initiatePaymentSession` **throw** user-facing copy from Server Actions. Next.js **redacts thrown messages in production** — the WB-071 F-C reassurance copy ("if you were charged, it will be reversed…") never reaches a prod customer after a post-auth completion failure; they get a generic masked error. Same class as the register/login React #31 fix: return an error string, don't throw. |
| B3 | MED | [lib/data/cart.ts:37](../../../storefront/src/lib/data/cart.ts#L37) | Cart is created **without auth headers** and there is no cart-transfer on login → a logged-in customer's order is linked to a guest customer record and **never appears in `/account/orders`**. Fix: pass `await getAuthHeaders()` at cart-create + transfer the cart after login. |
| B4 | HIGH (prior-audit #2, still open) | [product-detail/components/hero/index.tsx:66,83-88](../../../storefront/src/modules/product-detail/components/hero/index.tsx#L66) | Finish switch desyncs the bolt-pattern chip from the per-finish size grid — a wrong-pattern variant can reach the cart. From the 2026-07-06 audit (storefront #2); never claimed by any G9 cluster; re-verified present. |
| B5 | MED (prior-audit, still open) | [vendor-sync/service.ts:207-213](../../../backend/src/modules/vendor-sync/service.ts#L207) | SFTP matching **zero files** marks the run `completed` ("no feed file found") instead of failing loud. Vendor-sync #17 from 2026-07-06; unclaimed by WB-070. |
| B6 | MED (prior-audit, still open) | [admin/vendor-sync/purge-products/route.ts](../../../backend/src/api/admin/vendor-sync/purge-products/route.ts) | `purge-products` deletes the whole live catalog on a bare empty-body admin POST — no confirm guard (vendor-sync #19). |
| B7 | LOW | [checkout/components/payment/index.tsx:150](../../../storefront/src/modules/checkout/components/payment/index.tsx#L150) | `availablePaymentMethods?.length &&` renders a literal `0` when the list is empty (reachable in prod when only manual payment is configured). |
| B8 | LOW | [product-detail/components/hero/index.tsx:121](../../../storefront/src/modules/product-detail/components/hero/index.tsx#L121) | Variant-less product crashes the PDP hero (`pickDefaultSize([])` → `undefined.offsetVariants`). Only admin-created products; unguarded on a hot page. |
| B9 | LOW | [middleware.ts:100-101](../../../storefront/src/middleware.ts#L100) | Country-code detection uses `.includes(countryCode)` — any path segment containing "us" (`/customer`, `/trust`) skips the redirect and 404s. Fix `===`. |
| B10 | LOW | [cart/components/item/index.tsx:96-98](../../../storefront/src/modules/cart/components/item/index.tsx#L96) | Duplicate `<option value={1}>` — "1" appears twice in the qty select + duplicate React key warning. |
| B11 | LOW | [backend/src/admin/routes/vendor-sync/page.tsx:169](../../../backend/src/admin/routes/vendor-sync/page.tsx#L169) | The single non-baseline backend `tsc` error (`Table.Cell` `colSpan` typing). Runtime fine; keeps `tsc` from being a clean gate. |
| B12 | INFO | [checkout FitmentVerifiedCard] | "FITMENT VERIFIED · Confirmed by our team" renders whenever a vehicle is cached, regardless of whether cart items fit. Marketing copy vs data honesty — flag for the client, worse now that F3's tiering is planned. |

Also still open from the 2026-07-06 audit (unclaimed by G9, lower priority): vendor-sync #12
(changed path never updates variant options/title), #13 (add-path dedupe drops replacement SKUs),
#14 (thumbnails only set at creation), #18 (replaySku swallows errors), #20 (removed variants stay
in Meili), #21 (admin console pagination); storefront #6 (placeholder-pattern variants unsellable),
#7 (no qty-vs-stock gate at default qty 4), #19/#20/#23 (cart qty select unbounded).

---

## 3. What the site still needs to be complete & deployable

### P0 — blocks a real customer or real money
1. **Confirm the deployed builds are current.** Everything through WB-076 is pushed, but STATUS
   still records the live storefront carrying the **broken-login** bug (`fix/auth-headers-await`,
   merged `ec8c587`). Verify Railway rebuilt both services after 2026-07-09; `rm -rf backend/.medusa/server` traps apply.
2. **Emails don't send at all**: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` on the backend. Then fix
   `replyTo: 'info@example.com'` in both subscribers (WB-031) and the "invited to Medusa" branding.
   Only 2 templates exist (order-placed, invite) — minimum viable set also needs **shipping
   confirmation** and **password reset**.
3. **No password reset exists anywhere** (no storefront UI, no backend subscriber, no template) and
   the account "change password" form is a literal no-op (`profile-password/index.tsx:19` TODO). A
   customer who forgets a password is permanently locked out.
4. **Stripe live-mode cutover + the capture decision**: live keys + live webhook (`{BACKEND_URL}/hooks/payment/stripe_stripe`) + storefront rebuild —
   and note **capture is MANUAL by default** (provider sets `capture_method: "manual"`; the
   storefront treats `requires_capture` as success). Every order is authorize-only: either pass
   `capture: true` in provider options or make "capture in admin" an explicit fulfillment-runbook
   step (auths expire ~7 days → money never taken).
5. **US sales tax**: seed creates tax regions for 7 EU countries only — **US orders compute $0
   tax**. Create the US tax region + rates (admin) or integrate a provider. Compliance decision.
6. **Run the two guarded prod scripts** (WB-071, still pending per STATUS): `strip-manual-payment.ts`
   (until then unpaid orders are placeable) and `update-shipping-prices.ts` (free-≥$199 rule).
7. **Prod env hygiene**: `VENDOR_SYNC_DEV_MAX_ROWS` and `VENDOR_ALLOW_SAMPLE_FEED` must be UNSET in
   prod (the row cap silently guts the catalog); rotate `JWT_SECRET`/`COOKIE_SECRET` off
   `supersecret`; CORS trio must include the real storefront domain.
8. **Template drift that breaks provisioning**: `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (build
   hard-fails without it) and `NEXT_PUBLIC_STRIPE_KEY` are missing from
   `storefront/.env.local.template`; `RESEND_*` missing from `backend/.env.template`.
9. **Pending activation steps** (STATUS): Meilisearch re-sync for tire `fit_specs` (until then the
   `/tires` fit filter over-claims), first post-deploy FULL vendor sync (WB-070 hash change),
   confirm newsletter migration + `wheel-size-warm` cron live.

### P1 — operational completeness
10. **Vendor-sync alerting**: cron failures are logs-only today. A subscriber that emails on
    `failed`/`exhausted` runs + a "no successful run in 24h" watchdog (the Notification module is
    already there). Also configure the WheelPros `*_SFTP_*` credentials in prod.
11. **Legal/support surface**: `/contact` doesn't exist but order-Help links to it; no
    privacy/terms/returns pages (Stripe live mode + ad networks expect them); footer `href="#"`.
12. **Middleware resilience**: the region fetch has no try/catch — a backend blip on a cold edge
    instance 500s every page. Fall back to `NEXT_PUBLIC_DEFAULT_REGION`.
13. **Fix the fitment cluster (§1) + bugs B1–B6.**
14. **Purge the 4 demo apparel products** from prod (seed leftovers, 1,000,000 stock; the
    purge-products route deliberately skips non-vendor products — delete via admin).
15. **Pricing rule (WB-024)**: the store currently sells at vendor MSRP with zero margin control —
    open backlog item, business decision required before real volume.

### P2 — growth / quality
16. **SEO**: no `robots.txt`, no `sitemap.ts` — the biggest lever for a ~2,700-product catalog.
17. **No analytics, no error tracking, no `error.tsx`/`global-error.tsx`** anywhere.
18. Remaining boilerplate copy (WB-055), newsletter hardening (WB-057), gift cards (WB-054),
    express-pay/Affirm remain chrome-only (flags stay off), cart qty caps, dead `/results/*`
    redirect, remove `/admin/custom` + `/store/custom` stubs, key-exchange route removal.

### Doc drift to clean up
- `docs/in-progress/` is 100% stale (all 9 files = shipped tire work, WB-005/WB-063) — move to
  `done/` per the lifecycle rule; STATUS/BACKLOG refs point at `in-progress/` paths.
- STATUS "unpushed"/"local" claims are stale (everything through WB-076 is pushed).
- WB-069's "every one of the 76 audit findings is now fixed" over-claims — ~16 findings were never
  referenced by any G9 cluster (see §2 tail), three re-verified still in code.
- WB-072's deploy instruction to run `backfill-garage-bore.ts` conflicts with WB-076 (customer-vehicle
  module unregistered) — annotate or retire.
- `storefront/CLAUDE.md`: "FEATURED BLOCKS … remain editorial/placeholder", "`fitment: []` (Spec 2)"
  and the upcoming-garage framing contradict shipped reality.

---

## 4. Suggested order of attack

1. **Deploy-integrity pass (P0 #1, #6, #7, #9)** — nothing code-related, one ops session.
2. **Fitment fix cluster (§1.2 F1–F5)** — one spec/plan (candidate id: WB-077); it is the core
   product promise and the user-visible complaint. Backend `normalize.ts` + cache re-warm, then the
   three-tier verdict across the four storefront surfaces, golden-tested.
3. **Money/email P0s (#2–#5, #8)** — Resend env + replyTo + shipping-confirmation + password reset
   (candidate WB-078), Stripe live + capture decision, US tax.
4. **Bug batch B1–B6** (tire orphaned-fit, server-action error channel, cart↔customer association,
   finish/bolt desync, SFTP zero-file, purge guard) — candidate WB-079.
5. **P1 ops** (alerting, legal pages, middleware fallback, demo purge, pricing decision).
6. **P2 SEO/observability**, then the doc-drift sweep.
