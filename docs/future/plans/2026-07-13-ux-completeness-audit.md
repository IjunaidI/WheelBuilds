# 2026-07-13 · Full-site UX & product-logic completeness audit

> **Status: FINDINGS LOGGED — no code changed by this audit.**
> Method: seven parallel read-only code auditors, one per customer-facing surface
> (home/nav/search-drawer, discovery, PDP, cart/checkout, account/auth/email,
> cross-cutting chrome, product-data logic), each briefed on the known-open backlog
> (WB-024/025/026/031/054/055/057/058, retired garage, placeholder photography,
> deferred Sentry) so only NEW gaps are reported. All findings are code-traced with
> `file:line` evidence; three of the highest-impact backend claims (L1 Meili `status`
> field, L5 stock-only zeroing, N1 nav links) were independently re-verified.
> This is a **static audit** — nothing here was reproduced against the live site;
> each fix task re-verifies its findings against current `main` at build time
> (G9/G10 discipline).
>
> Fix specs: [../specs/2026-07-13-ux-completeness-fixes-design.md](../specs/2026-07-13-ux-completeness-fixes-design.md)
> Backlog: **WB-085…WB-096, WB-104** (fix group **G11**) + **WB-097…WB-103** (feature group **G12**) in [BACKLOG.md](../BACKLOG.md).
>
> **Addendum (same day):** a follow-up investigation of a user-reported "trim fitment is
> wrong" produced the **T findings** below (→ WB-104). Unlike the static N/D/P/C/A/X/L
> sweep, T1 was root-caused end-to-end: code trace + git-history confirmation.

## Overall verdict

The funnel core is genuinely strong: vehicle pick → fit-filtered discovery → per-variant
PDP verdicts → Stripe checkout all work and are honest where G9/G10 touched them. What
keeps the site from feeling *complete* is the ring around that core:

1. **The persistent chrome lies.** 5 of 7 primary nav items are dead (404 or `#`),
   9 footer links 404, the search drawer's "Trending" products are fabricated, and
   every social share still renders the "Next.js Starter Template / MEDUSA STORE" image.
   A shopper who steps off the happy path concludes the store is broken or fake.
2. **Search can't find products.** Model names ("NOMAD", "Wildpeak") are neither in
   titles nor searchable; sizes and synonyms return zero; the active query is invisible
   on the results page.
3. **Lifecycle truth decays.** Discontinued products are never evicted from the search
   index (dead PDP links), all-warehouse sellouts keep phantom stock for up to 12h,
   cart rows can render "$NaN" after a discontinue, and stock is never re-checked
   before the card is charged.
4. **The account section still contains boilerplate that fake-succeeds** (email edit,
   billing address) and hides order status/tracking entirely; the Resend provider
   reports success even when Resend rejects the send.

None of these is deep architecture — they are edges, seams, and inherited boilerplate.
The catalog machinery underneath held up well under audit.

## Findings register (deduped)

Severity is the auditor's rating; ✔ = independently re-verified this session.
Where multiple auditors found the same issue it is listed once with all evidence.

### N · Home / Nav / Footer / Search drawer / Vehicle picker → WB-085, WB-091

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| N1 ✔ | BLOCKER | Nav "Brands"→`/collections` + "Style"→`/categories` 404 (no index routes; catch-alls don't match bare paths); 9 footer Shop/Brands links 404; footer brand labels are design fixtures ("Forgiato Type") | `nav/index.tsx:12-20`, `mobile-menu/index.tsx:18-26` (duplicated array), `footer/index.tsx:6-46` | WB-085 |
| N2 | HIGH | "Build Gallery"/"Deals"/"Support" are `href="#"` → navigate to `/us#` (home); `/contact` exists but Support doesn't point at it | `nav/index.tsx:17-19` | WB-085 |
| N3 | HIGH | Search-drawer "Trending" is 3 fabricated products with fake prices; tapping runs a zero-result search | `search-drawer/trending.tsx:10-38` | WB-085 |
| N4 | MED | Static YMM fallback data stale (years end 2025, 12 makes) and sends display names where the wheel-size client expects slugs → silent empty fitment | `lib/garage/vehicle-data.ts:10-40`, `ymm-pane.tsx:62-67,105-110`, `backend wheel-size/client.ts:45-50` | WB-091 |
| N5 | MED | Vehicle saved during a failed/unavailable fitment resolve stays window-less forever — the retry path referenced in code is the retired garage-pane; hero then links bare `/store` | `ymm-pane.tsx:202-211,259-271`, `hero/index.tsx:27-29` | WB-091 |
| N6 | MED | Catalog Wall repeats 6 of the New-This-Week products (both slice `newestProducts` from index 0) | `new-drops-row:7-8`, `catalog-wall:59-60` | WB-085 |
| N7 | LOW | Fitment 503/quota → "contact support" toast (no support path exists) then routes to the *unfiltered* catalog | `ymm-pane.tsx:254-258` | WB-091 |
| N8 | LOW | Footer hardcodes "40+ premium aftermarket wheel brands" while hero/trust-strip compute the live count | `footer/index.tsx:75-77` | WB-085 |
| N9 | LOW | Vehicle context invisible on phones (<512px): GaragePill `hidden xsmall:flex`, hamburger menu has no vehicle entry | `nav/index.tsx:43-45`, `mobile-menu:18-32` | WB-085 |
| N10 | LOW | Nav heart "Saved" just links `/account` (no wishlist exists) | `nav/index.tsx:59-66` | WB-085 |
| N11 | LOW | "New This Week" heading over newest-6 data with no recency cutoff | `new-drops-row:15` | WB-085 |
| N12 | LOW | Hero placeholder→vehicle content flash after hydration (localStorage store; acceptable, optional polish) | `hero/index.tsx:15-29` | — (noted) |

### D · Discovery (/store, /tires, legacy listings) → WB-086/087/088

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| D1 | HIGH | Legacy `/categories`+`/collections` pages: fetch first 100 only, slice in memory, `totalPages` from real count → `/categories/wheels` advertises ~144 pages, pages 9+ render an empty grid; sort only within first 100; WB-084 `hasImage` filter runs after pagination; N+1 refetch per card; "… \| Medusa Store" titles; Next-14 sync params; all advertised in the sitemap | `lib/data/products.ts:107-151`, `paginated-products.tsx:61-71`, `product-preview:19-22`, `categories page:58-64`, `sitemap.ts:66-95` | WB-086 |
| D2 | HIGH | Search can't find model names — titles are `Brand + DisplayStyleNo`, the feed's `Style` name lands only in metadata; `searchableAttributes: [title, brand, skus]`; "nomad" → 0; "20x9 fuel maverick" → 0 (term order); no synonyms (rims→0) | `wheel-grouping.ts:165-170`, `build-metadata.ts:24-30`, `medusa-config.js:265` | WB-087 |
| D3 | HIGH | Active `?q` invisible + unclearable on results: no heading, no chip, `isAnyFilterActive` ignores `q`, empty state blames "these filters"; same on tires | `discovery/header:54-66`, `active-chips`, `use-discovery-query:169-177` | WB-087 |
| D4 | HIGH | Bolt-pattern facet on RAW vendor strings — "5X114.3" and "5X4.49"/"6X5.5" and "6X139.7" are the same physical pattern split into separate checkboxes; canonical field exists + filterable but unused outside fit mode | `get-products.ts:44,65-66`, `bolt-pattern-canonical.ts:46-65` | WB-088 |
| D5 | MED | Cards understate multi-size products: `diameters[0]` (ascending) + `bolt_patterns[0]` — filter Diameter=22, grid says 17″; empty → `0"`; no "N sizes" like the tire card; `price_min: 0` docs render "From $0.00" and lead price-asc | `get-products.ts:115-126`, `build-search-document.ts:108,117` | WB-088 |
| D6 | MED | Meili/Store-API outage renders "No wheels match these filters" — blames the shopper's filters for an outage (never-throw adapter, no error channel) | `get-products.ts:382-385`, tire twin `:226-229` | WB-088 |
| D7 | MED | Tire fit mode caps at 200 with NO `isCapped` honesty (missed the WB-074 D2 pass); also `passesFitFilter` passes empty `fit_specs` — verify the prod re-sync ran | `get-tire-products.ts:106-108,154-181` | WB-088 |
| D8 | MED | Price min/max inputs push a full navigation per keystroke (history spam, transient filters); no min>max/negative validation → silent empty grid | `filter-sections.tsx:220-244` + tire twin | WB-088 |
| D9 | MED | No `faceting.maxValuesPerFacet` → facet lists truncate at Meili's default 100 values — a tire size outside the top-100 is unfindable and invisibly missing | `medusa-config.js:264-284` | WB-088 |
| D10 | LOW | Numeric facets sorted popularity-then-lexicographic (20, 18, 22, 17…; "15" before "9"); wheel rail lacks the inch mark the chips have | `filter-sections.tsx:45-47` | WB-088 |
| D11 | LOW | Out-of-range `?page` renders "no matches" (or fit-mode "nothing fits your vehicle") instead of clamping | `templates/index.tsx:55-65` | WB-088 |
| D12 | LOW | `lit()` escapes quotes but not backslashes — a crafted param empties the whole catalog view via the D6 path | `discovery/data/escape.ts:2-3` | WB-088 |
| D13 | LOW | Polish: page change keeps scroll position; `fit=0` opt-out doesn't survive a new drawer search (FitmentSync re-applies); `estimatedTotalHits` presented as an exact count; legacy RefinementList keeps `?page` on sort change | `use-discovery-query:73-82`, `fitment-sync:17-18`, `get-products:348` | WB-088 |

### P · PDP (wheel + tire) → WB-090, WB-091

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| P1 | HIGH | Default offset = first-listed (availability-blind) → Status stat "In stock" (size-level, best-of-siblings) while the buy button says "Out of stock" (variant-level) on the same screen | `group-sizes.ts:88`, `hero/index.tsx:140-147`, `variant-picker:141-151` vs `purchase-panel:68-69` | WB-090 |
| P2 | HIGH | Qty stepper inventory-blind (cap 99, default 4, low-stock ≤4) → adding 4 when 1–3 exist fails with "try again in a moment" (permanent condition presented as transient); exact count never reaches the panel | `purchase-panel:62-66` (+tire twin), `pdp-config:15-21`, `cart.ts:110-123` | WB-090 |
| P3 | HIGH | Tire fitment band renders "runs a different factory tire size" when there is simply NO OEM data (null collapsed into false); chip says "MAY NOT FIT" — the wheel unknown-tier (WB-072 S5) never reached tires | `tire/fitment.tsx:42-46,100-110`, `tire-fits-vehicle.ts:21` | WB-091 |
| P4 | MED | Wheel chip says "DOESN'T FIT" where the band says unknown (empty-pattern case, acknowledged in-code as deferred) | `purchase-panel:48-59`, `product-has-fitting-variant.ts:48-50` | WB-091 |
| P5 | MED | Band subtext mixes per-variant tier with the product-level (variants[0]-bore) verdict → contradictory copy on multi-bore wheels; reverse-fitment query has the same variants[0]-bore approximation | `fitment/index.tsx:122-136`, `fits-vehicle.ts:57-62`, `get-product.ts:133-137` | WB-091 |
| P6 | MED | Fabricated claims + dead links: "we'll verify final offset at order review" (no such process), "Fitment guarantee · Or money back" (no backing page), tire "Submit your vehicle… 24 hours" `href="#"`, "What is offset?" `href="#"`, "fully cleared / Pros approved" over-claims | `fitment/index.tsx:124`, `pdp-config:32`, `tire/fitment:155-163`, `advanced-fitment-panel:97-103,188-190` | WB-091 |
| P7 | MED | Negative offsets render "+-12MM" across the advanced panel | `advanced-fitment-panel:129,153,164` | WB-090 |
| P8 | MED | Every size shows the SAME weight — the representative variant's *shipping* weight labeled "Per-wheel weight"; per-variant weights exist in Medusa but aren't fetched | `get-product.ts:53`, `apply.ts:1066-1071`, `products.ts:47` | WB-090 |
| P9 | MED | Backend outage → every PDP 404s (`getRegion` catch-all null → `notFound()`) — deindexing risk, wrong message | `regions.ts:45-47`, `get-product.ts:101-102` | WB-090 |
| P10 | MED | Wheel PDPs have no description: empty `<p>` + `description: ""` metadata (vendor-sync never writes one; tire panel guards, wheel doesn't) | `apply.ts:392-413`, `purchase-panel:142-152`, `products page:31-34` | WB-090 |
| P11 | MED | Tire PDP lacks the B8 variant-less guard → "$0.00 PER TIRE · MAY NOT FIT · Out of stock" | `tire/hero/index.tsx:99-104` | WB-090 |
| P12 | MED | Selected-variant price silently falls back to a sibling's; all-price-less product renders "$0.00" with an ENABLED buy button | `hero/index.tsx:209-212`, `purchase-panel:68-69` | WB-090 |
| P13 | MED | Tire "YOUR VEHICLE" row highlight matches make+model only (1998 Civic highlights the 2021 Civic row); wheel list does year-range matching | `tire/fitment.tsx:140-143` | WB-091 |
| P14 | MED | "N CONFIRMED MODELS" = previously-cached lookups only, cap 24 — undisclosed on the wheel PDP ("0 CONFIRMED MODELS" reads as "fits nothing"); tire section already has the non-exhaustive note | `by-product route:6-23`, `fitment/index.tsx:67-70` | WB-091 |
| P15 | LOW | Finish switch always resets size/offset (fresh per-finish arrays defeat the reference-equality guard) — comparing one size across finishes silently re-snaps | `finish-options.ts:35`, `hero/index.tsx:123-129` | WB-090 |
| P16 | LOW | OOS cells are disabled buttons — tooltip (only per-size price/lead-time surface) unreachable; all-OOS products show no visibly-selected cell | `variant-picker:56-88` | WB-090 |
| P17 | LOW | Offset chips duplicate per bore-only/load-only variant differences (dup keys possible); fit-mode "DEFAULT" badge tracks the auto-picked fitting ET, not the wheel default | `advanced-fitment-panel:105-119`, `hero:139-141` | WB-090 |
| P18 | LOW | "Low stock — last few sets" at ≤4 units (= at most ONE set) | `variant-picker:26`, `pdp-config:21` | WB-090 |
| P19 | LOW | Non-vendor products (no variant metadata) render a "0×0" size cell via the wheel-template default branch | `get-product.ts:109`, `group-sizes:49-56` | WB-090 |

### C · Cart / Checkout / Confirmation → WB-092

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| C1 | HIGH | Cart/mini-cart/receipt line prices read the LIVE variant price, not the stored line amount → visible drift from subtotal after a vendor-sync reprice; a discontinued (drafted) product renders literal "$NaN" + `/products/undefined` link (checkout summary uses `item.total` correctly) | `line-item-price:14-23`, `line-item-unit-price`, `cart.ts:169-214` | WB-092 |
| C2 | HIGH | No stock re-validation before payment: Stripe charges (capture:true) BEFORE `placeOrder`; an OOS failure lands post-capture with "if you were charged it will be reversed" (refund not guaranteed); cart shows no OOS state (WB-034 cap never drops below current qty) | `payment-button:136-197`, `max-qty.ts:22-24` | WB-092 |
| C3 | MED | Backend failure renders "Nothing in your cart" (retrieveCart swallows to null) or a silently-vanished checkout form (CheckoutForm returns null when shipping/payment fetch fails) | `cart.ts:21-27`, `checkout-form:32-34` | WB-092 |
| C4 | MED | Checkout header shows a fictional support phone "(855) 555-RIDE" (tel:+18555557433); footer "TERMS · PRIVACY · REFUND POLICY" plain text; review consent names policies with zero links; APPLE/GPAY badges while wallets unwired | `(checkout)/layout.tsx:36-54`, `review:40-45` | WB-092 |
| C5 | MED | Confirmation fabricates: hardcoded "FREE 2–3 DAY SHIPPING · UPS GROUND" (even for paid/express), ETA computed at view time, "Tracking will hit your phone" (no SMS), unconditional "we've sent a confirmation" | `order-completed-template:30-31,80-97` | WB-092 |
| C6 | MED | Receipt shipping price mangled to "$10,00" (euro decimal) via a `.replace` chain; unguarded `[0]` accesses in shipping/payment details | `shipping-details:59-66`, `payment-details:13` | WB-092/093 |
| C7 | MED | Chosen finish invisible on cart/mini-cart (wheel variant titles carry no finish; thumbnail is the product-representative finish — Bronze buyer sees a Black wheel); checkout summary disagrees (shows options) | `line-item-options`, `cart item:58-62`, `apply.ts:1073-1084` | WB-092 |
| C8 | MED | `/order/confirmed` 500s a just-charged customer on a transient fetch failure (retrieveOrder rethrows → `notFound()` is dead code); bad order URL → error page not 404 | `orders.ts:8-17`, `confirmed/[id]/page.tsx:16-18` | WB-092 |
| C9 | MED | `updateLineItem`/`deleteLineItem`/`addToCart`/`applyPromotions` still throw (B2 pattern not extended) → prod-redacted messages; DeleteButton swallows failures silently | `cart.ts:126-167,265-276`, `delete-button:18-22` | WB-092 |
| C10 | LOW | Fit card claims "FITMENT CHECKED · GUARANTEED" if ANY line fits (mixed carts); "refund every penny" contradicts the returns policy on outbound shipping | `fitment-verified-card:37-46,73-77` | WB-092 |
| C11 | LOW | `?step=` deep links beyond prerequisites render inert collapsed sections (WB-033 covered only bare `/checkout`) | `review:16-19,36` | WB-092 |
| C12 | LOW | Guest cart cookie expires 7 days after CREATION (never renewed) | `cookies.ts:36-44` | WB-092 |
| C13 | LOW | Shipping step never shows option descriptions; at $199+ both options render identically at $0.00; no empty-state if zero options | `shipping/index.tsx:115-122` | WB-092 |
| C14 | LOW | Nits: "Another step will appear" summary after refresh; missing `?.` on `shipping_methods`; `paymentInfoMap[...]` crash on unmapped provider; un-awaited Next-15 `params`; "You purchase was successful" metadata typo | `payment:50,262-264`, `confirmed/[id]/page:9-11` | WB-092 |

### A · Account / Auth / Orders / Email → WB-093, WB-094

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| A1 | HIGH | Resend provider treats API failures as success — the SDK returns `{data, error}` and never throws; the provider logs "Successfully sent" unconditionally; password-reset/order emails can silently never send | `resend.ts:97-102`, resend@4.0.1 d.ts | WB-094 |
| A2 | HIGH | Billing-address form wired to the wrong action (no addressId, `billing_address.*` names vs unprefixed reads, `is_default_billing` never set) — every save fails; profile completion capped at 75% | `profile-billing-address:37-40,96-164`, `customer.ts:195-223` | WB-093 |
| A3 | HIGH | Email edit is a silent no-op that reports success (boilerplate stub, update call commented out) | `profile-email:19-34` | WB-093 |
| A4 | HIGH | Order status/payment status render as EMPTY strings (formatStatus commented out, labels kept); no fulfillment/tracking display anywhere in the account; `retrieveOrder` doesn't request fulfillment fields | `order-details:39-57`, `orders.ts:8-17` | WB-093 |
| A5 | MED | No `default.tsx` for the account `@login`/`@dashboard` parallel routes → hard refresh + auth-state change lands on a 404 (documented starter bug) | `account/layout.tsx:11-17` | WB-093 |
| A6 | MED | Order history hard-capped at 10, no pagination — the 11th order disappears from the site | `orders.ts:19-27` | WB-093 |
| A7 | MED | Order/shipping emails: unbranded body, raw money ("Total: 1479.96 usd"), flex-div layout (Outlook), and NO link back to the store — for guests the emailed link is the only route back to their order | `order-placed.tsx:50,74-103`, `base.tsx` | WB-094 |
| A8 | MED | Dead links: account footer "Customer Service"→`/customer-service` (404); register consent → `/content/privacy-policy` + `/content/terms-of-use` (404) — real pages exist at `/contact` `/privacy` `/terms` | `account-layout:33`, `register:78,85` | WB-093 |
| A9 | MED | No password rules anywhere — 1-character passwords accepted; nothing communicated | `register:65-72`, `reset-password:34-49` | WB-093 |
| A10 | MED | `signout` calls async `removeAuthToken()` un-awaited before `redirect()` (the documented banned auth-bug class); dead `revalidateTag("auth")` | `customer.ts:145-151` | WB-093 |
| A11 | MED | Orders page promises "you can also create returns or exchanges" — no such affordance exists anywhere | `orders/page.tsx:23-26` | WB-093 |
| A12 | LOW | Phone editor renders literal "null", `type="phone"` (invalid; no tel keyboard), `required` → can never clear | `profile-phone:53,63-65` | WB-093 |
| A13 | LOW | (= C6) "$25,00" shipping price + unguarded `[0]`s in the shared order components | `shipping-details:59-66` | WB-093 |
| A14 | LOW | Copy cluster: "succesfully" typo; order-card "+N more" uses quantity math (wrong count, 4th product hidden silently); "let us change that :)" empty state | `account-info:85`, `order-card:46,67-73` | WB-093 |
| A15 | LOW | JWT cookie maxAge 7d but backend `jwtExpiresIn` unset (Medusa default ~1d) → session silently dies on day 2 | `cookies.ts:18`, `medusa-config.js:98-99` | WB-093 |

### X · Cross-cutting (routing, SEO, a11y, perf) → WB-085/095/096

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| X1 | HIGH | Site-wide OG/Twitter share image is the boilerplate "Next.js Starter Template / MEDUSA STORE" screenshot; "… \| Medusa Store" titles on category/collection pages; favicon likely still Medusa | `app/opengraph-image.jpg`, `twitter-image.jpg`, `public/favicon.ico` | WB-095 |
| X2 | HIGH | No canonicals/hreflang anywhere; every 2-letter prefix (`/de/store`…) serves indexable duplicate content with wrong-currency prices; the one canonical that exists (categories) resolves to a 404 URL | grep `alternates\|canonical`, `categories page:62-64`, `middleware:151-163` | WB-095 |
| X3 | HIGH | Env fallbacks silently poison prod: `getBaseURL()`→`https://localhost:8000` feeds metadataBase/OG/robots/sitemap; missing `NEXT_PUBLIC_SEARCH_ENDPOINT` ships a silently EMPTY catalog; `check-env-variables.js` validates only the publishable key | `env.ts:1-3`, `meilisearch.ts:9-12`, `check-env-variables.js:3-10` | WB-095 |
| X4 | MED | Unlabeled controls in the flagship flows: YMM selects, price inputs, search input (placeholder-only), icon-only cart delete button (`Field` supports `htmlFor` but callers don't pass it) | `field:59-67`, `ymm-pane:290-362`, `delete-button:31-38` | WB-096 |
| X5 | MED | Keyboard focus invisible on WB-styled controls (`outline: none`, zero `:focus` rules in wheel-builds.css); PDP size/bolt buttons convey selection by color only (no `aria-pressed`; gallery finish buttons are the correct model) | `wheel-builds.css:318,371`, `variant-picker:63-88` | WB-096 |
| X6 | MED | Small orange/gray mono text fails WCAG AA site-wide: #FF6A00 at 11px ≈ 2.9:1, `--ink-soft` #8A8A8E at 9-11px ≈ 3.5:1 (needs 4.5:1) — the two most-used non-body tones; DESIGN.md owns the decision | `label:14-17,55-66`, `micro-link:31-40` | WB-096 |
| X7 | MED | `images.unoptimized` at catalog scale: srcset/`sizes` inert, grids ship 500px vendor PNGs (no WebP/AVIF), PDP hero upscales 500px into ~50vw; NOTE: middleware matcher does NOT exclude `_next/image` — flipping the optimizer on without fixing the matcher breaks it | `next.config.js:16-17`, `middleware:199-201` | WB-096 (note) |
| X8 | LOW | Middleware edges: cookieless `?cart_id` links 307-redirect to themselves forever; `notFound()` (unsupported in middleware) on zero regions; `/US/store` → `/us/US/store` → 404 | `middleware:67,153-192` | WB-096 |
| X9 | LOW | Loading/not-found coverage: home, categories/collections, and the whole `(checkout)` group render blank on slow hard loads (no loading.tsx); both not-found pages are unrebranded chrome-less boilerplate (what every dead link renders) | route-tree enumeration | WB-085/096 |
| X10 | LOW | Duplicate DOM ids when the mobile filter drawer is open (desktop rail stays in DOM); latent cross-dimension "20" collision | `filter-sections:54` | WB-096 |
| X11 | LOW | Analytics is page-views only — zero funnel events (add-to-cart, checkout steps, purchase) | `analytics/index.tsx` | WB-096 |

### L · Product-data lifecycle & identity → WB-087/088/089

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| L1 ✔ | HIGH | Discontinued products NEVER leave the Meili index: plugin `fields` lacks `status`, so the plugin's own draft-eviction branch (`!product.status \|\| status==='published'` → add) always re-adds; drafting emits `product.updated` → re-upsert; the boot-time full sync runs once; the WB-084 reindex script uses the same broken path. Cards → dead PDPs; sitemap emits dead URLs | `medusa-config.js:258-263` ✔, plugin `upsert-product.js` (1.3.5), `apply.ts:809-820` | WB-089 |
| L2 | HIGH | (= D2) model/style name never reaches title/search/PDP | `wheel-grouping:165-170` | WB-087 |
| L3 | MED | Zero/absent-MSRP rows pass staging ungated → variant priced $0, `price_min: 0`, "From $0.00" cards, addable at $0, wins price-asc | `parse-helpers:86-92`, `schema.ts:39`, `build-search-document:117-118` | WB-089 |
| L4 | MED | Discontinued VARIANTS (kept + flagged + zeroed) still contribute price/facets to the index — "From $279" can be a permanently-dead variant; storefront never reads `metadata.discontinued` (0 grep hits) | `apply.ts:717-754`, `build-search-document:66-95` | WB-089 |
| L5 ✔ | MED | 3h stock-only cron can't zero an ALL-warehouse sellout: staging only writes `qoh > 0` rows and the stock pass selects parts FROM that table → phantom stock persists up to 12h (partial sellouts are handled — WB-070 A1) | `stage.ts:92-104` ✔, `service.ts:553-557` ✔ | WB-089 |
| L6 | MED | (= P8) per-variant weight exists, PDP shows one shipping weight for all sizes | `apply.ts:1066-1071` | WB-090 |
| L7 | MED | (= D2/D3-adjacent) no `synonyms`, no size-token search anywhere in index settings | `medusa-config.js:264-284` | WB-087 |
| L8 | LOW-MED | Tire identity gaps: vendor-abbreviation titles ("WDPEAK AT4W" not "Wildpeak A/T4W"); junk descriptions become confident model titles; dash-metric sizes ("285/45-22") unparsed → PDP size label = raw part number, excluded from size facet AND fit filter | `tire-parse-helpers:77-156`, `tire-facets:20-28`, golden fixtures | WB-089 |
| L9 | LOW | Known-FU blast radius measured: literal "BLANK" is a live facet checkbox; parser recognizes "CALL" as placeholder but `isRealBoltPattern` doesn't → would render verbatim as a clickable chip | `filter-sections:181`, `parse-helpers:31`, `group-sizes:14` | WB-089 |
| L10 | LOW | Handle/slug collisions between distinct group keys permanently fail those groups on every run (silent catalog gaps, visible only in the admin console) | `wheel-grouping:27-32,182-187`, `apply.ts:191-197` | WB-089 |

### T · Trim honesty (follow-up investigation, user-reported) → WB-104

| id | sev | finding | evidence | → |
|---|---|---|---|---|
| T1 ✔ | HIGH | **Confirmed-models lists attribute union-of-all-trims fitment to ONE arbitrary trim.** WB-077 (`0ae83be`) made `normalizeByModel` union windows/bolt-patterns across EVERY trim entry, but `extractVehicleIdentity` still reads `raw.data[0]` (WB-009 code `4d0992f`, untouched) for the displayed make/model/**trim**. Since "Any trim" is the drawer DEFAULT, most cache rows are multi-trim: the PDP renders "2021 Ford F-150 *〈whatever trim the API listed first〉*" with a ✓, where the match may only hold via a DIFFERENT trim's window or bolt pattern. Tire list shares the helper (`reverse-tire-fitment.ts:58`) | `normalize.ts:54-65`, `reverse-fitment.ts:47-62,104-109`, `fitment/index.tsx:246-249`; git-history-confirmed regression seam | WB-104 |
| T2 ✔ | MED | **"YOUR VEHICLE" highlight misfires**: `trimMatches` compares the shopper's drawer trim LABEL against T1's arbitrary `data[0]` trim → a trim-picking user's own row usually doesn't highlight (or highlights beside a different trim's name); AND the make compare is slug-vs-display-name (`"land-rover"` vs `"Land Rover"`) → multi-word makes never highlight | `fitment/index.tsx:200-214`, `ymm-pane.tsx:53` (make value = slug) | WB-104 |
| T3 | MED | **Trim pick silently ignored for non-usdm trims**: the trim dropdown is the GLOBAL modifications catalog (`client.modifications` sends no region) while fitment queries usdm — a non-US trim slug returns empty and `resolveByModel` silently retries WITHOUT the trim, caching all-trims data under the trim's cache key. No log, no user signal | `client.ts:55-57`, `service.ts:227-233` | WB-104 |
| T4 | MED | **The drawer's `slug` assumption for `/modifications/` items is untested** — no fixture or live test pins the payload shape (WB-043's gated live test covers `by_model` only). If items lack `slug`, `toOptions` falls back to the NAME → by_model `modification=<name>` → empty → T3's silent fallback: every trim pick would behave as "Any trim" | `ymm-pane.tsx:40-59`, `live-slug.test.ts` (by_model only) | WB-104 |
| T5 | note | Two non-bugs that can feed "trim is wrong" reports: (a) **by design** since WB-077, any-trim rows union windows — an in-window-via-another-trim setup reads full FITS (accepted trade-off; CHECK only covers out-of-window); (b) **deploy state** — WB-077 shipped with a MANDATORY prod `wheel_size_fitment` truncate and commits since `a614063` may be unpushed; if prod predates WB-077, users are still seeing the OLD single-arbitrary-trim false negatives. Verify before attributing reports to current code | STATUS 2026-07-10/11 entries; `cache-key.ts` v2 comment | WB-104 (ops step) |

## Missing-but-expected (feature gaps → G12)

Consolidated from all seven auditors; only items judged genuinely valuable for this store:

- **Guest order access** — the confirmation URL is public but nothing ever re-gives it to a guest (the order email has no link — A7). "Find my order" page + email deep links. → WB-097 (+WB-094)
- **PDP merchandising completeness** — set-of-4 price framing (default qty IS 4), part-number/SKU display, stock count + ship ETA at the CTA (today tooltip-only, invisible on touch), tire load/speed legend, special-order (`InvOrderType: SO`) lead-time signal, derived backspacing (computable from width+offset today). → WB-098
- **Brand & style landing pages** — three surfaces already want `/collections` (nav, footer, ShopByBrand); style presets exist in `style-map.ts`. The real fix behind the WB-085 repoint. → WB-099
- **Availability signals in discovery** — stock is not indexed at all; sold-out products are indistinguishable on the grid. `in_stock` boolean in the doc + badge + facet (needs a stock-cron reindex hook). → WB-100
- **Journey connectors** — wheels↔tires cross-sell (vehicle known on both surfaces), recently-viewed rail, search typeahead. → WB-101
- **Staggered fitment** — no front/rear axle concept anywhere (data, PDP, cart); staggered-OEM vehicles match on either axle unlabeled. Big; deliberately deferred. → WB-102
- **Post-purchase self-service** — reorder, return-request flow (Medusa ships the machinery; A11's copy already promises it), welcome email + marketing opt-in at registration (newsletter module exists, unused at the highest-intent point), account deletion. → WB-103
- **Feed enrichment (recorded, not tasked)** — tire UTQG/warranty/3PMS/tread-depth and wheel construction/true-weight are absent from the FEED itself; needs a data-source decision (relates WB-024 pricing work), not adapter fixes.

## Dedup / already-known notes

- Fake phone + unlinked checkout policies found by two auditors → one fix (WB-092).
- Dead nav/footer chrome found by three auditors → one fix (WB-085).
- Legacy category/collection breakage found by three auditors → one fix (WB-086).
- NOT re-reported (already tracked): WB-024/025/026 (pricing/de-hardcode), WB-031, WB-054 (gift cards), WB-055 (Medusa-copy sweep — though A8/X1's *broken hrefs* and *share image* are distinct and tasked), WB-057, WB-058, photography, wishlist backend, Sentry, D3 disjunctive fit facets, DRAFT policy copy.
- N12 (hero hydration flash) logged, not tasked — acceptable trade-off of the localStorage vehicle store.
