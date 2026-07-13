# UX completeness fixes — consolidated design (G11 + G12)

> Remediates the [2026-07-13 full-site UX & product-logic audit](../plans/2026-07-13-ux-completeness-audit.md).
> Finding ids (N/D/P/C/A/X/L/T) reference that doc's register. Tasks: **WB-085…WB-096 + WB-104**
> (fix group **G11**, build order below) and **WB-097…WB-103** (feature group **G12**).
> Discipline as G9/G10: each task RE-VERIFIES its findings against current `main` before
> speccing tasks in detail — the audit is static; some findings may have shifted.
> (Exception: WB-104's T1 was root-caused live, code + git history — not static.)
>
> **Build order (G11):** WB-089 (backend lifecycle — needs a Meili re-sync others benefit from)
> → WB-085 (chrome) → WB-087 (search) → WB-088 (discovery) → WB-090 (PDP) → WB-091 (fitment)
> → **WB-104 (trim honesty — same session as WB-091, adjacent files)**
> → WB-092 (cart/checkout) → WB-093 (account) → WB-094 (email) → WB-086 (legacy retirement)
> → WB-095 (SEO) → WB-096 (a11y/polish, runs last).
> G12 items are independent; WB-100 depends on WB-089; WB-099 supersedes part of WB-085's repoint.

---

## WB-085 · Site chrome integrity — dead links, fabricated drawer content, honest home sections

**Findings:** N1, N2, N3, N6, N8, N9, N10, N11, X9 (not-found rebrand), + `/results`/`/search` redirects.

**Problem.** The persistent chrome (nav, footer, search drawer) is the least-trustworthy part
of the site: 2 nav items 404, 3 navigate to `#`, 9 footer links 404, the drawer's Trending
panel shows three fabricated products with fake prices, and the page every dead link lands on
is chrome-less Medusa boilerplate.

**Design.**
1. **One shared `NAV_ITEMS` module** (currently copy-pasted in `nav/index.tsx` + `mobile-menu/index.tsx`).
   New entries: Wheels `/store`, Tires `/tires`, Brands → `/store` pre-opened on the brand rail
   (interim until WB-099), Style → `/store?…` style presets from `style-map.ts`, Support → `/contact`.
   DELETE "Build Gallery" and "Deals" until those pages exist.
2. **Footer Shop column** → the exact facet URLs `styleTiles()` already builds (`?diameters=…`,
   `?finishes=…`); **Brands column** → `/store?brands=<real top brands>` sourced from the live
   brand facet (server component — reuse `getHomeCatalog`), drop the fixture names; "All Brands"
   → `/store`. Soften the "40+ brands" blurb or render the live `brandCount` (N8).
3. **Trending panel**: feed top-3 of `getHomeCatalog().newestProducts` (real handle/price/thumb,
   links to PDPs); remove the section if the fetch is empty. No fabricated content remains (G4 rule).
4. **Nav polish**: remove the heart "Saved" icon (no wishlist backend); add a vehicle row at the
   top of the mobile hamburger menu (reuse `GaragePill`/`VehicleTile size="md"` → opens search drawer) (N9/N10).
5. **Home sections**: `CatalogWall` slices `newestProducts.slice(4, 12)` (N6); rename
   "New This Week" → "New Arrivals" or gate on `isNew` (N11).
6. **Not-found rebrand**: root + `(main)` `not-found.tsx` get WB styling; `(main)`'s renders
   inside Nav/Footer chrome with a search CTA + `/store` link (X9 cosmetic part).
7. **Redirects** in `next.config.js`: `/:cc/results/:query` → `/:cc/store?q=:query`, `/:cc/search`
   → `/:cc/store` (retired-route SEO guard).

**Verify.** Crawl every `href` in nav/mobile-menu/footer → all resolve 200 (script or e2e);
grep confirms no `href="#"` in layout modules and no `BLACKLINE|VANGUARD|ATLAS` in search components;
mobile menu shows the vehicle row; not-found renders WB chrome.

**Out of scope:** real brand/style landing pages (WB-099), Deals page, wishlist.

---

## WB-086 · Retire (redirect) the legacy /categories + /collections listing path

**Findings:** D1, X9 (category canonical from the audit's X2 note), L-adjacent (sitemap dead URLs).

**Problem.** Boilerplate taxonomy pages paginate a 100-product fetch against the real count
(pages 9+ of `/categories/wheels` are empty), sort within 100, N+1-fetch per card, carry
"| Medusa Store" titles + a canonical that resolves to a 404 — and the sitemap advertises all of it.

**Decision (recommended): redirect, don't rebuild.** The discovery surfaces already do this job better.
1. `next.config.js` redirects (301): `/:cc/categories/wheels` → `/:cc/store`;
   `/:cc/categories/tires` → `/:cc/tires`; any other `/:cc/categories/:rest*` → `/:cc/store`.
2. `/collections/[handle]` page becomes a thin server redirect: resolve the collection by handle
   (brand collections), 301 to `/:cc/store?brands=<collection.title>`; unknown handle → `/store`.
   (Route-level redirect because the brand name needs a lookup; static rules can't map it.)
3. Drop taxonomy URLs from `sitemap.ts` (§ that emits categories/collections).
4. Quarantine now-dead code: `modules/store/PaginatedProducts` path, `modules/categories`,
   `modules/collections` templates + `getProductsListWithSort` consumers — delete or mark orphaned
   (grep-check `Thumbnail`/`SortOptions` imports that must stay — see storefront/CLAUDE.md retained-module notes).
5. WB-084's legacy-path `hasImage` gate becomes moot on these routes — note in its backlog entry.

**Verify.** `/us/categories/wheels` 301s to `/us/store`; `/us/collections/<brand>` 301s to the
brand-filtered store; sitemap contains no `/categories/`/`/collections/` URLs; vitest passes
after module removal; `pnpm build:next` clean.

**Out of scope:** WB-099 brand pages (which may later re-introduce `/brands/<slug>` properly).

---

## WB-087 · Search that finds products — model names, synonyms, size tokens, visible query

**Findings:** D2, D3, L2, L7.

**Problem.** Titles are `Brand + DisplayStyleNo`; the human model name (feed `Style`, e.g. NOMAD)
is metadata-only and unsearchable; there are no synonyms; sizes aren't searchable text; and on the
results page the active query is invisible and unclearable.

**Design.**
- **Backend (vendor-sync + Meili settings):**
  1. Carry `style` into the indexed doc (`buildSearchDocument`: `style: metadata.style`) and —
     when `style` is a real name, not a code (heuristic: contains a letter and ≠ displayStyleNo) —
     append it to the product TITLE at group-build time (`buildGroupTitle`: `"{Brand} {Style} {No}"`),
     so cards/PDP/cart all show it. Keep handle derivation UNCHANGED (no URL churn).
  2. Add a `search_text` field: joined size tokens (`"20x9"`, …), canonical bolt patterns
     (`"5x114.3"`), style/model words. Tire doc: include the un-abbreviated model when the
     WB-089 alias map provides one.
  3. `searchableAttributes: ['title', 'brand', 'style', 'skus', 'search_text']`;
     add `synonyms: { rims: ['wheels'], wheels: ['rims'], tyre: ['tire'], tyres: ['tires'] }`.
- **Storefront:** header shows `RESULTS FOR "<q>"` when `q` present; `active-chips` renders a
  removable `q` chip; `isAnyFilterActive` includes `q`; empty state names the query. Same in the
  tire twin.

**Verify.** Unit: doc builder emits style/search_text; golden search-settings snapshot. Live (post
re-sync): `"nomad"`, `"rims"`, `"20x9 <brand>"` each return hits; the query renders in the header
and its chip clears it. Existing title-dependent tests updated deliberately (title change is intended).

**Deploy.** Backend restart (settings) + **full Meili re-sync** (title/doc change re-indexes every
product) — piggyback on WB-089's re-sync. Product title change also affects emails/receipts (fine —
they render the stored line title at purchase time).

---

## WB-088 · Discovery filter & listing truth

**Findings:** D4–D13, X10 (dup ids handled in WB-096).

**Design (all storefront except the two config lines):**
1. **Canonical bolt-pattern facet (D4):** `FACET_FIELDS`/`buildFilters` switch `bolt_patterns` →
   `bolt_patterns_canonical`; labels render dual-unit ("6×139.7 (6×5.5″)") via a small
   mm→inch lookup (the canonical module already snaps to standard PCDs).
2. **Card honesty (D5):** card shows diameter RANGE ("17″–24″") or "N sizes" (tire-card parity);
   when a diameter filter is active, show the matching diameter; suppress price when
   `priceCents === 0`; drop the `?? 0` → render nothing on missing dims.
3. **Outage-honest empty state (D6):** adapter returns a discriminated
   `DiscoveryResult | { ok: false }`; template renders "Catalog temporarily unavailable — retry"
   instead of the no-matches copy. Cache behavior unchanged (throw already bypasses `unstable_cache`).
4. **Tire isCapped parity (D7):** port `isCapped` + `estimatedTotalHits` + header/mobile-trigger
   copy from the wheel module; ops step: confirm live `fit_specs` coverage (empty-`fit_specs` docs
   pass the fit gate until the re-sync).
5. **Price inputs (D8):** commit on blur/Enter (or debounce ≥500ms), `router.replace` for scalar
   edits, clamp negatives, swap min>max.
6. **Facet scale (D9):** `faceting: { maxValuesPerFacet: 500 }` in the plugin `indexSettings`;
   tire Size section gains a filter-as-you-type input over the loaded values.
7. **Polish (D10–D13):** numeric-ascending sort for dimension facets + inch-mark parity; clamp
   out-of-range `?page` to the last valid page; escape backslashes in `lit()`; scroll to grid top
   on page change; `fit=0` survives a new drawer search (thread the param in the drawer's submit
   route); use exhaustive `totalHits` (page/hitsPerPage mode) instead of `estimatedTotalHits`.

**Verify.** Vitest: facet builder uses canonical field; card range rendering; `lit()` backslash
golden; page-clamp; price-input commit semantics. Live: one physical pattern = one checkbox;
filter Diameter=22 shows 22″ on every card.

**Deploy.** Backend restart for `maxValuesPerFacet` (settings only — no re-sync needed beyond WB-089's).

---

## WB-089 · Catalog lifecycle & data integrity (backend)

**Findings:** L1 ✔, L3, L4, L5 ✔, L8, L9, L10.

**Design (backend vendor-sync + one config line):**
1. **Index eviction (L1):** add `'status'` to the Meili plugin `fields` in `medusa-config.js`
   — the plugin's own draft-eviction branch then works (verified against @rokmohar 1.3.5 source).
   Belt-and-braces: a daily job emits `meilisearch.sync` for a full reconcile (strays + drafts).
2. **All-zero stock (L5):** `runStockOnly` derives `stagedParts` from `vendor_feed_staging`
   (all staged parts) instead of `vendor_stock_staging` (positives only), so the zero-out pass
   reaches SKUs that sold out everywhere. Regression test: part with stock rows in run N, none in
   run N+1 → levels zeroed by the stock-only pass.
3. **$0 price gate (L3):** staging skips rows with `msrpUsd <= 0` (counted in run summary as
   `skipped_invalid_price`, mirroring the image-less filter); storefront card/PDP $0 guards land
   in WB-088/WB-090.
4. **Discontinued variants out of the index (L4):** `buildWheelDocument`/`buildTireDocument`
   skip variants with `metadata.discontinued === true` (price/facets/sizes derive from live
   variants only; product with ZERO live variants → return null like image-less).
5. **Placeholder patterns at the transformer (L9 — closes the WB-074 follow-up):** filter
   `BLANK`/`N/A`/`CALL`/empty from `bolt_patterns` in the doc; add `"call"` to the storefront
   `PLACEHOLDER_BOLT_PATTERNS` twin.
6. **Tire parsing (L8):** add the dash-metric size pattern (`WWW/AA-RR`) to `parseTireSize`;
   add a small brand-model alias map (Falken WDPEAK→Wildpeak class, top ~10 brands, golden-tested);
   treat "nothing stripped + no confident tokens" as unconfident (per-SKU fallback) instead of a
   literal junk title.
7. **Slug collisions (L10):** on `createProductsWorkflow` unique-handle violation, retry once with
   a `-<groupKeyHash6>` suffix; error only if that also collides.

**Verify.** `pnpm test:sync` green with new cases per item (each RED against old behavior);
after deploy + re-sync: a drafted product disappears from Meili within the reconcile window;
a forced all-zero part shows 0 stock after the next stock tick.

**Deploy.** Backend deploy → restart (plugin fields) → **full Meili re-sync** (doc shape changed).
Same re-sync serves WB-087. The next FULL vendor sync re-applies hashes where staging rules changed
(idempotent, run off-peak — WB-070 precedent).

---

## WB-090 · PDP purchase honesty — stock, price, and selection truth

**Findings:** P1, P2, P7–P12, P15–P19, L6.

**Design (storefront; one field-string change):**
1. **Consistent stock story (P1):** organic-mode default offset = best-availability ET of the
   selected size (reuse the fit-mode `resolveLeafVariant` availability ordering); the Status stat
   reads the SELECTED VARIANT's availability, not the size roll-up.
2. **Inventory-aware quantity (P2, P18):** thread `inventory_quantity` through `OffsetVariant`
   → panel caps the stepper at available qty, clamps the default (min(4, available)), renders
   "Only N left" when ≤ threshold; add-to-cart catch branches Medusa's insufficient-inventory
   error into "Only N in stock — reduce quantity", keeping the generic copy for real transport errors.
   (Tire panel: same treatment.)
3. **Price truth (P12):** never fall back to a sibling's price for the headline; `unitPriceCents <= 0`
   → "Price unavailable" + disabled purchase buttons.
4. **Guards (P11, P19):** tire hero early-returns the B8 "no purchasable options" message when
   `sizeOptions` is empty; wheel grouping drops sizes with `diameter/width <= 0` ("0×0" cells).
5. **Availability of information (P16):** OOS cells stay focusable (aria-disabled pattern) so the
   tooltip works; all-OOS products render an explicit "Currently out of stock" banner.
6. **Selection continuity (P15):** finish switch looks up the same `D×W|pattern` in the new finish
   before falling back to default.
7. **Data corrections (P8/L6):** fetch `+variants.weight`, per-size weight in the grid/tooltips,
   labeled "shipping weight"; (P7) sign-aware offset formatting (+/-); (P17) dedupe offset chips
   by ET, key by variantId, pass the true wheel default separately from the fit-mode auto-pick.
8. **Resilience (P9):** `getRegion` distinguishes "fetch failed" (throw → route error boundary)
   from "no region for countryCode" (404).
9. **Description (P10):** guard the empty `<p>`; `generateMetadata` falls back to a templated
   description ("<Brand> <Model> wheels in N sizes, finishes X/Y — live fitment check"); (backend
   optional follow-up: write the same template into `product.description` at apply time).

**Verify.** Vitest per rule (default-offset availability, qty clamp, $0 gate, finish-continuity,
weight threading). Live: pick an in-stock size on a mixed-availability product → Status, price and
button agree; add 4 of a 2-left variant → actionable message.

---

## WB-091 · Fitment honesty completion — verdict consistency + grounded claims

**Findings:** P3, P4, P5, P13, P14, P6, N4, N5, N7, L-adjacent (multi-bore P5/L13).

**Design (storefront + tiny backend read):**
1. **Tire unknown tier (P3):** `activeFits` becomes three-state (`fits/no/unknown`); missing OEM
   data renders "We don't have factory tire data for your <vehicle> yet — check your door placard"
   + a neutral chip (wheel WB-072 S5 parity).
2. **Wheel chip unknown (P4):** chip renders the neutral state when the product has no canonical
   patterns or the vehicle has no pattern data (same condition as the band).
3. **Band subtext from fitView (P5):** derive fits/check subtext from the per-variant `fitView`
   result; product-level `fitsVehicle`/reverse-fitment take the most-permissive bore of the group
   (or the per-size bore set) instead of `variants[0]`.
4. **Tire YOUR-VEHICLE row (P13):** port the wheel list's `yearMatches`/`trimMatches`.
5. **Reverse-fitment disclosure (P14):** wheel section gains the tire section's "non-exhaustive"
   note + a "Check YOUR vehicle" CTA (opens the drawer); hide the count when 0.
6. **Grounded claims (P6):** remove "we'll verify final offset at order review"; "Fitment
   guarantee" chip links a real "How fitment works" section on `/returns` (or drop the money-back
   wording); tire "Submit your vehicle" CTA → `/contact`; "What is offset?" → in-page anchor of the
   advanced panel's diagram; soften "fully cleared"/"Pros approved" to the WB-062-honest default-ET copy.
7. **Resolve-failure recovery (N4/N5/N7):** regenerate `vehicle-data.ts` from a cached wheel-size
   slug+label snapshot (years through 2027); the FindByVehicle current-vehicle row gains "Re-check
   fit" (calls `resolveFitmentForVehicle` + `update()`) shown when the active vehicle lacks windows;
   the unavailable-branch toast keeps the drawer open with honest "temporarily down — try again"
   copy (and stops implying support can fix it).

**Verify.** Vitest: three-state tire verdict golden; chip/band agreement matrix (fits/check/no/unknown
× wheel/tire); year-match port. Live: vehicle without OEM tire data shows the unknown band, not
"runs a different size".

---

## WB-092 · Cart & checkout correctness — stored prices, stock preflight, resilient failures

**Findings:** C1–C14 (C6 shared components with WB-093).

**Design (storefront + one backend script check):**
1. **Stored-amount pricing (C1):** `LineItemPrice`/`LineItemUnitPrice` render `item.total`/
   `item.unit_price` (the amounts actually charged); live variant data only decorates; a missing
   enriched variant renders the stored title + amounts (never NaN, never `/products/undefined`).
2. **Stock preflight (C2):** `placeOrder` (and the review step on mount) compares line quantities
   against live `inventory_quantity` BEFORE the client may confirm payment; failures return the
   B2-shaped error naming the item; cart lines get an OOS/insufficient badge when live qty < line qty
   (display-only — the WB-034 cap stays).
3. **Failure states (C3, C8):** `retrieveCart` distinguishes network/5xx (throw → boundary) from
   404/no-cart (null); `CheckoutForm` renders an explicit "couldn't load delivery/payment options —
   retry" block instead of `null`; `retrieveOrder` catches → null so `notFound()` works, and the
   `(main)` boundary copy near `/order/confirmed` acknowledges "your order may still have gone
   through — check your email".
4. **Action error contract (C9):** extend the B2 return-shape to `updateLineItem`, `deleteLineItem`,
   `addToCart`, `applyPromotions`; `DeleteButton` surfaces failures (sonner).
5. **Checkout chrome trust (C4):** remove the 555 phone → "Need help? Contact us" → `/contact`;
   link TERMS/PRIVACY/REFUND strings; link the review-step consent copy; drop APPLE/GPAY badges
   (finish WB-035).
6. **Honest confirmation (C5, C10):** shipping line derives from `order.shipping_methods[0]`
   (name + real paid amount); ETA anchored to `order.created_at`; tracking copy → email;
   email-sent line conditional or softened; fit card requires `every` fitting line (or lists
   which were checked) + refund copy aligned with the returns policy.
7. **Receipt correctness (C6):** delete the `.replace` decimal-mangle; guard `[0]` accesses;
   `paymentInfoMap` fallback title. (Shared `ShippingDetails`/`PaymentDetails` — coordinate with WB-093.)
8. **Flow guards (C11, C12):** server-side step clamp in `checkout/page.tsx` (furthest-allowed
   step from cart state); sliding cart-cookie renewal on cart reads.
9. **Line identity (C7):** cart/mini-cart lines render variant option values (checkout-summary
   parity) and prefer `variant.metadata.image_url` (per-finish image) for the thumbnail.
10. **Nits (C13, C14):** shipping-option descriptions + zero-options empty state; optional-chaining
    fixes; await Next-15 params; metadata typo.

**Verify.** Vitest: line-price source, preflight logic, step clamp, retained B2 shapes. Live (test
Stripe): OOS-between-add-and-pay blocks BEFORE charge with a named item; discontinue-a-carted-product
renders stored title/price, not NaN.

---

## WB-093 · Account & order-history truth

**Findings:** A2–A6, A8–A15, C6-shared.

**Design (storefront + one backend env):**
1. **Billing address (A2):** dedicated `updateCustomerBillingAddress` action reading
   `billing_address.*` names — find-or-create the address with `is_default_billing: true`;
   profile completion reachable to 100%.
2. **Email edit (A3):** replace the fake-success form with a read-only field + "contact us to
   change your login email" copy (auth-identity desync makes a real flow a separate project).
3. **Order status & tracking (A4, A11):** `retrieveOrder` fields gain
   `*fulfillments,*fulfillments.labels`; order detail renders fulfillment/payment status +
   tracking numbers/links; orders-page copy stops promising returns/exchanges and points at
   `/returns` + `/contact`.
4. **Route integrity (A5):** add `account/@login/default.tsx` + `@dashboard/default.tsx`.
5. **Orders pagination (A6):** thread `?page=` through `listOrders` (limit/offset + count) with
   the standard pager.
6. **Auth hygiene (A9, A10, A15):** `minLength={8}` + helper copy on register/reset (server-side
   check in the actions); `await removeAuthToken()`; drop the dead `revalidateTag("auth")`;
   set backend `http.jwtExpiresIn: "7d"` to match the 7-day cookie (verify the 2.13.6 default first).
7. **Fixes & copy (A8, A12, A13, A14):** repoint `/customer-service` → `/contact` and register
   consent links → `/privacy` + `/terms`; phone editor (`type="tel"`, optional, no "null" render);
   shared order components decimal/guard fixes (with WB-092); typo sweep ("succesfully",
   `sata-testid`, order-card "+N more" math, WB-voice empty states).

**Verify.** Vitest for the new action + pagination; e2e-ish smoke: save billing address →
overview shows it; order detail shows real statuses; refresh `/account/profile` then logout → login
form, not 404.

---

## WB-094 · Transactional email reliability & coverage

**Findings:** A1, A7, + welcome/cancel gaps, reset-expiry copy.

**Design (backend email-notifications module):**
1. **Fail loud (A1):** `const { error } = await this.resend.emails.send(message); if (error) throw
   new MedusaError(...)` — the notification records failure and the watchdog/logs see it. Remove the
   SendGrid-shaped catch parsing.
2. **Branded base (A7):** `base.tsx` gains a Wheel Builds header/footer (text-logo, support links);
   table-based layout for the order/shipping item lists (Outlook); an `Intl.NumberFormat`-based
   `formatUsd` helper replaces every raw `value usd` render; **"View your order" button** on
   order-placed + shipping-confirmation using `STOREFRONT_URL` → `/order/confirmed/<id>` (this is a
   guest's only route back — pairs with WB-097).
3. **Coverage:** `order.canceled` subscriber + template (customer must not learn of a cancellation
   from silence); optional welcome-on-register template (D-flag: merchant may prefer silence);
   reset email states the real 15-minute expiry.
4. Keep WB-078's no-enumeration + redirect patterns untouched.

**Verify.** Jest: provider throws on `{error}`; template snapshots render branded header + formatted
money + order link. Live roundtrip (needs `RESEND_*` set — runbook §1): place test order → email
arrives with working order link.

---

## WB-095 · SEO & shareability

**Findings:** X1, X2, X3, + JSON-LD/title-template/sitemap-lastmod gaps. (X-category canonical moot
after WB-086.)

**Design (storefront):**
1. **De-boilerplate (X1):** replace `opengraph-image.jpg`/`twitter-image.jpg` with WB art; PDP adds
   `openGraph.images: [product.thumbnail]`; replace `favicon.ico`; kill the remaining
   "| Medusa Store" titles (categories/collections die with WB-086 — grep for stragglers).
2. **Title template:** root layout `title: { template: "%s | Wheel Builds", default: "Wheel Builds —
   Wheels & Tires With Live Fitment" }`.
3. **Canonicals (X2):** every indexable page emits `alternates.canonical` on the `us` prefix;
   middleware 301s unknown-but-valid-format country prefixes to `/us` while single-region
   (keep the seeded `/de` unreachable rather than indexable).
4. **Structured data:** `Product` JSON-LD on the PDP (name, brand, image, offers: live price,
   availability, USD) + `BreadcrumbList` (breadcrumb component already has the trail).
5. **Sitemap:** add `lastModified` from Meili `created_at`; (taxonomy URLs already dropped by WB-086).
6. **Env guards (X3):** `check-env-variables.js` requires `NEXT_PUBLIC_BASE_URL`,
   `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_SEARCH_ENDPOINT`, `NEXT_PUBLIC_SEARCH_API_KEY`;
   `sitemap.ts`/`robots.ts` emit statics-only + log loudly when `getBaseURL()` is the localhost fallback.

**Verify.** Share-card validator on / and a PDP; Rich Results test passes on a PDP; `curl -I /de/store`
→ 301 `/us/store`; build fails without the four env vars.

---

## WB-096 · Accessibility & interaction chrome (runs last)

**Findings:** X4, X5, X6, X8, X10, X11, D13-scroll (if not landed in WB-088), + dead-deps cleanup.

**Design:**
1. **Names (X4):** `Field` passes `htmlFor`/`id` (prop exists — wire the YMM selects, price inputs);
   `aria-label="Remove item"` on `DeleteButton`; label the drawer search input.
2. **Focus (X5):** `:focus-visible` outline rules for `.field`, `.vehicle-tile`, WB
   `Select`/`TextInput` in `wheel-builds.css` (2px `--orange` offset outline); `aria-pressed` on PDP
   size/bolt cells (gallery finish buttons are the model).
3. **Contrast (X6):** DESIGN.md decision + token change: sub-18px accent text → darker orange
   (≈ #D14A00, 4.6:1) or ink; `--ink-soft` → ≈ #6E6E73. Applies via the token, not per-component.
4. **Middleware edges (X8):** same-URL redirect falls through to `next()`; lowercase the country-code
   segment compare; replace the middleware `notFound()` with a passthrough + logged error.
5. **Dup ids (X10):** `filter-<key>` ids gain a section+instance prefix.
6. **Funnel events (X11):** Plausible custom events — `add_to_cart`, `begin_checkout`, `purchase`
   (order-confirmed mount) — no-ops when analytics is off.
7. **Cleanup:** delete orphaned `search-client.ts` + `side-menu` + `country-select`; drop
   `@meilisearch/instant-meilisearch`, `react-instantsearch-hooks-web`, `algoliasearch` deps;
   note `_next/image` matcher exclusion next to `images.unoptimized` for whoever flips the optimizer (X7).
8. **Loading coverage (X9):** `loading.tsx` for `/` and the `(checkout)` group (skeleton parity).

**Verify.** axe pass on home/store/PDP/cart shows no unlabeled-control or duplicate-id violations;
keyboard-only walk: vehicle pick → filter → size pick → add to cart all visibly focused.

---

## WB-104 · Trim honesty — reverse-fitment identity + trim-narrowing integrity

**Findings:** T1 ✔, T2 ✔, T3, T4, T5 (ops). Root cause confirmed by code trace + git history:
WB-077 (`0ae83be`) made cache rows multi-trim (windows/patterns union across `raw.data`),
while `extractVehicleIdentity` (WB-009 `4d0992f`, untouched) still labels each row from
`raw.data[0]` — an arbitrary trim. Runs in the same session as WB-091 (adjacent files);
keep the two branches separate per SDD discipline.

**Problem.** With "Any trim" as the drawer default, the PDP's "N CONFIRMED MODELS" list
(wheel AND tire) renders union-of-all-trims fitment under one arbitrary trim name — a
public wrong-trim confirmation on the site's trust surface. Downstream, the "YOUR VEHICLE"
highlight compares the shopper's trim label against that arbitrary trim (and a make SLUG
against a display NAME), so it misfires. Separately, two seams silently discard a chosen
trim: global-catalog trims that don't exist in usdm (broad fallback, no signal), and an
untested `slug` assumption on the `/modifications/` payload.

**Design.**
1. **Trim-honest identity (T1, backend `reverse-fitment.ts`).** `extractVehicleIdentity`
   becomes multi-trim-aware: when `raw.data` has >1 entry (an any-trim/union row), return
   `trim: undefined` — the row renders as "2021 Ford F-150" with no trim claim; only a
   trim-narrowed row (1 entry, or all entries sharing one trim name) may name its trim.
   Make/model/year-label logic unchanged. Both reverse builders (wheel + tire) get this
   for free via the shared helper. Also thread a `trimNarrowed: boolean` onto
   `ReverseFitmentVehicle` (data[?].length === 1) for future disclosure copy — display
   change itself stays minimal.
2. **Honest YOUR-VEHICLE matching (T2, storefront `fitment/index.tsx` + tire twin).**
   - Make/model compare via a shared `slugify`-normalized equality (lowercase, spaces↔hyphens
     collapsed) so `"land-rover"` matches `"Land Rover"`.
   - Trim compare: with T1, union rows carry no trim → `trimMatches` passes on
     absent-either-side (existing rule) and the highlight anchors on make/model/year. When
     the row IS trim-narrowed, compare against BOTH the vehicle's stored trim label and its
     `modificationSlug` (slug-normalized) — whichever matches.
   - Port the same normalization to the tire list's highlight while WB-091's P13 fix
     (year/trim matching) lands there — coordinate, don't duplicate.
3. **Region-scoped trim dropdown (T3).** `client.modifications` + the
   `/store/vehicle-catalog/modifications` route gain a `region` param (default usdm, same
   default as fitment) so the drawer only offers trims that can actually narrow a usdm
   lookup. AND make the fallback visible: when `resolveByModel` falls back from a
   trim-narrowed query to the broad one, `logger.warn` with the discarded slug, and set
   `source.trimNarrowed = false` on the returned fitment (additive field; no UI change
   required this pass).
4. **Pin the slug contract (T4).** Extend the gated live test (`live-slug.test.ts` pattern,
   `RUN_WHEEL_SIZE_LIVE`) with: (a) `/modifications/` items expose a string `slug`; (b) a
   `by_model` call narrowed by one of those slugs returns non-empty data whose entries all
   carry that trim. Plus an offline unit test freezing `toOptions`' slug-first precedence
   against a captured modifications fixture.
5. **Ops (T5).** Verify prod actually runs WB-077 (+ the mandatory `wheel_size_fitment`
   truncate) before judging user reports against the new logic — one runbook-style check:
   inspect a prod cache row's `cache_key` for the `|v2` suffix. Record the outcome in
   STATUS. The any-trim union semantics themselves stay as designed (WB-077 D-defaults);
   if wrong-trim FITS complaints persist AFTER this task, the escalation path is a
   trim-scoped verdict (windows per selected trim) — out of scope here, note only.

**Out of scope.** Per-trim verdict windows (would re-open WB-077's false-negative
trade-off); staggered/axle handling (WB-102); the confirmed-list disclosure copy overhaul
(WB-091 P14 owns it).

**Verify.**
- Unit (backend): `extractVehicleIdentity` golden — multi-trim raw → `trim: undefined`,
  single-trim raw → that trim; reverse builders emit no trim for union rows.
- Unit (storefront): highlight matrix — slug-vs-name make, label-vs-slug trim, union-row
  (no trim) anchoring on year/make/model.
- Gated live: modifications slugs resolve through by_model narrowed non-empty.
- Live smoke: a PDP whose confirmed list previously showed a trim on an any-trim row now
  shows the bare vehicle; a trim-picked vehicle highlights its own row.

---

# G12 · Conversion & completeness features

## WB-097 · Guest order access — "find my order"
A public `/order/lookup` page (email + order display-id → server action calls the public
`GET /store/orders/:id` shape / order-by-display-id lookup, shows the confirmation view on match;
no enumeration: generic failure copy). Footer + `/contact` link it. Pairs with WB-094's email
deep link (which is the primary route back). **Verify:** guest can re-reach their order with
email + order number; wrong pairs leak nothing.

## WB-098 · PDP merchandising completeness
Set framing ("$X × 4 = $Y per set" under the price, qty-aware); variant SKU/part-number line
(copyable); stock + lead-time surfaced at the CTA (not tooltip-only) incl. the `InvOrderType: SO`
"special order — extended lead time" signal (metadata already carries it); tire load/speed legend
tooltip ("118S — 2,910 lb / 112 mph"); derived backspacing spec row (computable from width+offset).
**Verify:** touch-device shopper sees stock/ETA without hover; SO variants show the signal.

## WB-099 · Brand & style landing pages
Real `/brands` index (live brand facet + counts) + `/brands/[slug]` (brand hero + discovery grid
scoped `?brands=`) on the discovery engine — NOT the legacy path; optional `/styles/[slug]` from
`style-map.ts` presets. Nav "Brands"/"Style" repoint here (supersedes the WB-085 interim). Sitemap
gains brand pages. **Verify:** nav Brands → a real indexable page listing every live brand.

## WB-100 · Availability signals in discovery *(depends WB-089)*
`in_stock: boolean` (any live variant with stock) on both doc types; stock-only apply pass triggers
re-index for parts whose in-stock flag flipped (hook into the WB-089 reconcile job if simpler);
card "OUT OF STOCK" badge + an "In stock only" facet toggle. **Verify:** a sold-out product is
visibly marked on the grid and excludable.

## WB-101 · Journey connectors
"Need tires for these wheels?" cross-link band on `/store` fit mode → `/tires?fit=` (and inverse);
recently-viewed rail (localStorage, PDP visits, home + PDP placement); search-drawer typeahead
(server action → Meili, 3+ chars, debounced). **Verify:** vehicle-active shopper can hop
wheels↔tires in one click with fit preserved.

## WB-102 · Staggered fitment support [XL — needs its own design pass]
Front/rear axle concept: wheel-size cache already returns per-axle OEM data (front/rear objects);
extend `VehicleFitment` windows per axle, PDP staggered picker (2+2), cart pairing, fit verdicts
per axle. Deliberately deferred — spec before build.

## WB-103 · Post-purchase self-service
Reorder button (order items → `addToCart` batch, skips dead variants with a note); return REQUEST
flow (Medusa return machinery + a simple form → admin; aligns the A11 copy); registration marketing
opt-in checkbox → newsletter module; account-deletion contact path on the profile page.
**Verify:** returns copy promises only what exists.
