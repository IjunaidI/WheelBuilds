# Audit findings — storefront commerce (discovery, home, PDP, cart/checkout, account)

> **Raw finding log** from the 2026-07-06 done-specs audit (workflow run wf_7e98d308-058; 27 reviewers over all 24 done plan/spec units + 6 business-logic domains; 116 raw -> 76 unique findings). Findings against customer-facing surfaces: discovery facets and caching, home merchandising honesty, PDP pricing/selection logic, cart/checkout, and account flows.
>
> **These are logged findings, not yet plans.** Statuses: CONFIRMED = survived a 3-lens adversarial panel (refute / business-impact / concrete-repro); PENDING = single-reviewer claim awaiting verification. Convert to detailed specs/plans (superpowers:writing-plans) before implementation. Umbrella: [2026-07-06-audit-remediation-theme.md](2026-07-06-audit-remediation-theme.md).

**24 findings** — high: 5, medium: 13, low: 6

---

## 1. [HIGH] Fit mode never filters or defaults the offset axis — PDP can default to an out-of-window offset under an only-what-fits banner

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** spec-gap | **Where:** `storefront/src/modules/product-detail/components/hero/index.tsx:115` | **Found by:** spec:fitment-aware-pdp
- **Evidence:** Spec Goal: filter 'bolt pattern, size, offset, and color/finish' with defaults.offsetMm = 'a fitting offset for the default size'. buildFitView's trim (fit-view.ts:63-69) keeps a size when ANY offsetVariant is in-window but never trims offsetVariants, and hero line 115 sets defaultOffsetMm = selectedSize.defaultOffsetMm ?? selectedSize.offsetMm (the wheel default) with no fit awareness; AdvancedFitmentPanel receives the full offsetVariants list unmarked.
- **Impact:** A fit-flow shopper (offsetWindow ET35-50) lands on a size offered in ET15 and ET40 whose wheel default is ET15: the hero defaults to the non-fitting ET15 with the FitBanner reading 'Showing only options that fit your {vehicle}' — the exact add-a-non-fitting-wheel risk the spec was written to close, mitigated only by the small MAY NOT FIT chip contradicting the banner.

## 2. [HIGH] Finish switch desyncs the bolt-pattern chip from the per-finish size grid — wrong-pattern variant can reach the cart

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/components/hero/index.tsx:91` | **Found by:** spec:pdp-bolt-pattern-axis, spec:pdp-correctness-polish
- **Evidence:** boltPatternOptions is product-wide (hero/index.tsx:66) but the grid is built from the ACTIVE FINISH's sizes: visibleSizes = sizesForBoltPattern(activeFinish.sizeOptions, selectedBoltPattern) (lines 64, 91-94). sizesForBoltPattern (group-sizes.ts:107-113) falls back to ALL sizes on zero match. The re-snap effect (lines 83-88) fires only when boltPatternOptions changes — never on finish change; finishes can cover different pattern subsets (even at first render: boltPatterns[0] comes from variants[0]'s finish while finishes sort alphabetically). The fallback also yields duplicate sizeKey React keys (sizeKey omits boltPattern, variant-picker.tsx:29).
- **Impact:** A shopper with chip '6x139.7' active who switches finish can see and add-to-cart sizes whose real bolt_pattern_raw is 5x150 while the UI asserts 6x139.7 — the exact WB-003 wrong-fitment-purchase bug re-opened across the WB-059 finish axis. The 'MAY NOT FIT' chip only mitigates with a garage vehicle set.

## 3. [HIGH] Fit-mode facet counts tally only the FIRST diameter/bolt-pattern of each multi-valued product

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/discovery/data/get-products.ts:137` | **Found by:** spec:fitment-catalog-search, domain:discovery-meili
- **Evidence:** In fit mode, facets are rebuilt via facetsFromProducts(fitting) (line 212), which tallies p.diameter and p.boltPattern — but hitToProduct sets `diameter: h.diameters?.[0] ?? 0` and `boltPattern: h.bolt_patterns?.[0] ?? ""` (lines 117-119), collapsing the Meili multi-valued arrays to their first element. Non-fit mode uses Meili facetDistribution which counts every array value. The tire twin explicitly fixed this: facetsFromTireHits (get-tire-products.ts:117-131) tallies the raw multi-valued hit fields with a comment explaining why.
- **Impact:** With a vehicle fit active, Diameter and Bolt pattern sections show wrong counts and can omit values entirely. Concrete: user filters diameters=22 in fit mode; a wheel with diameters [17,20,22] passes the Meili filter but tallies under '17', so the rail shows a phantom '17' and the checked '22' checkbox can disappear from the list, leaving the user unable to uncheck it from the rail.

## 4. [HIGH] Checkout TOTAL rounds to whole dollars then fakes '.00' precision — displayed total differs from the amount charged

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/checkout/templates/checkout-summary/index.tsx:181` | **Found by:** spec:checkout-cart, domain:money-pricing
- **Evidence:** Line 181: `{Math.round(total).toLocaleString(undefined, { minimumFractionDigits: 2 })}` — cart.total (dollars, e.g. 1479.96) is rounded to 1480 BEFORE formatting, rendering "$1,480.00", which reads as exact. LineItemRow does the same at line 131 (Math.round(total)), and the Affirm line at 188. Meanwhile Subtotal/Shipping/Tax rows (lines 153-170) use convertToLocale with exact cents, so the TOTAL row does not equal the sum of the rows above it, and the cart page's CartTotals (common/components/cart-totals/index.tsx:89) formats the same cart.total exactly — cart says $1,479.96, checkout says $1,480.00.
- **Impact:** The number the customer sees immediately before placing the order differs from the Stripe charge by up to $0.50 in either direction (totals ending .50-.99 charge MORE than shown), with fake two-decimal precision; rows don't sum to the total, cart and checkout disagree, and the receipt won't match what checkout showed. One-line fix: drop the Math.round.

## 5. [HIGH] placeOrder silently discards cart-completion errors — customer's card is authorized but no order is created and nothing is shown

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/lib/data/cart.ts:323` | **Found by:** domain:cart-checkout
- **Evidence:** placeOrder only handles cartRes.type === "order" (cart.ts:323-331) and otherwise returns cartRes.cart, dropping the error object. @medusajs/types StoreCompleteCartResponse documents: 'If `cart`, then an error has occurred' with an error payload returned with HTTP 200, so `.catch(medusaError)` never fires. Every caller ignores the return value: StripePaymentButton.onPaymentCompleted (payment-button/index.tsx:97-105) only catches thrown errors and its finally just resets the spinner.
- **Impact:** Completion failures (e.g. inventory reservation failure on oversell) happen AFTER stripe.confirmCardPayment succeeds: the card is authorized, the spinner stops, and nothing else happens — no order, no error, no redirect. PDP steppers allow up to 99 units regardless of stock, so this path is realistic and strands an authorized PaymentIntent with zero user/ops feedback.

## 6. [MEDIUM] Variants with placeholder bolt patterns become invisible and unsellable on products that also have real patterns

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/data/group-sizes.ts:55` | **Found by:** spec:pdp-bolt-pattern-axis
- **Evidence:** groupVariantsIntoSizes normalizes placeholder patterns ('', 'BLANK', 'N/A') to boltPattern '' (lines 54-55), and mapToDetail filters them out of boltPatternOptions via isRealBoltPattern (get-product.ts:45-51). When a product mixes real and placeholder patterns, selectedBoltPattern is always a real pattern (hero/index.tsx:68-69), so sizesForBoltPattern returns only that pattern's sizes — the ''-pattern SizeOptions match no chip and the all-sizes fallback never fires (matching.length > 0). With exactly one real pattern the chip row is hidden entirely (variant-picker.tsx:108), leaving no UI path to the blank-pattern sizes.
- **Impact:** Any wheel group where some vendor rows carry BLANK/N/A bolt patterns while siblings carry real ones has those variants permanently hidden from the PDP — in-stock inventory that can never be viewed or purchased, with no signal to ops. WB-048 kept placeholders out of the picker, but neither spec decided what happens to their variants; the code silently drops them.

## 7. [MEDIUM] No quantity-vs-stock gate: default qty 4 on a low-stock variant gives an enabled buy button that always fails with a 'try again' toast

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:66` | **Found by:** spec:pdp-add-to-cart
- **Evidence:** canPurchase = !!selectedVariant && selectedVariant.availability !== "out_of_stock" (lines 66-67) never compares quantity to on-hand stock; the stepper allows up to 99 (line 64). DEFAULT_WHEEL_QTY = 4 equals LOW_STOCK_THRESHOLD = 4 (pdp-config.ts:15,21), so every variant with 1-3 units shows an enabled 'Add to cart' at qty 4. Medusa v2's add-to-cart inventory confirmation rejects the over-add, landing in the generic catch: toast.error("Couldn't add to cart", { description: "Please try again in a moment." }) (lines 81-84). Exact qty exists at mapping time (group-sizes.ts:57) but only the 3-bucket enum is threaded onto OffsetVariant.
- **Impact:** Common case (any low-stock variant — guaranteed overlap since threshold == default qty): user is shown a purchasable price, clicks, and gets a misleading transient-error message that retrying can never fix, with no hint of the real cause or max purchasable quantity; Buy Now fails the same way.

## 8. [MEDIUM] PDP, related, and featured loaders pin pricing to the default region — add-to-cart uses the URL's countryCode region

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/data/get-product.ts:100` | **Found by:** spec:fitment-catalog-search, spec:pdp-add-to-cart
- **Evidence:** getProductDetail ignores the route's countryCode: `const region = await getRegion(DEFAULT_COUNTRY)` (line 100, DEFAULT_COUNTRY = NEXT_PUBLIC_DEFAULT_REGION || "us", line 29); page.tsx calls getProductDetail(handle) with no countryCode though params carries one. getRelatedProducts (lines 141,153) and home get-featured.ts:64 do the same. Meanwhile PurchasePanel calls addToCart({variantId, quantity, countryCode}) with countryCode from useParams() (purchase-panel.tsx:59,73-77), and getOrSetCart creates the cart on THAT region (lib/data/cart.ts:28-53).
- **Impact:** Visitors on a non-default countryCode (seed created a Europe region, so middleware can route EU visitors to /de) see default-region prices on the PDP while the cart prices lines in their real region's currency — displayed price diverges from the charge, or the add fails if the variant has no price in that currency. Safe only while single-region; nothing guards or documents that assumption.

## 9. [MEDIUM] Related-products and home Featured mappers read retired product.metadata.finish — every card shows black since WB-059

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/data/get-product.ts:172` | **Found by:** spec:fitment-catalog-search, spec:pdp-correctness-polish, spec:pdp-data-honesty, spec:home-merchandising, spec:finish-as-variant, domain:discovery-meili
- **Evidence:** getRelatedProducts maps `finishes: [normalizeFinish(pmeta.finish)]` (get-product.ts:172) and getFeaturedProducts does the same (storefront/src/modules/home/data/get-featured.ts:43). WB-059 moved finish to VARIANT metadata: backend/src/modules/vendor-sync/pipeline/build-metadata.ts:7-9 explicitly says 'finish has moved to VARIANT metadata' and buildProductMetadata no longer emits a finish key. normalizeFinish(undefined) returns "black" (normalize-finish.ts:16-23). The WB-059 plan's Task 7 Step 4 required updating stray non-PDP consumers. get-featured also derives boltPattern from variants[0] only, so multi-pattern curated cards under-badge.
- **Impact:** Since the WB-059 cutover, every PDP 'Similar wheels' card and curated home Featured card shows one black swatch and a black wheel render regardless of real finishes (bronze/silver-only wheels misrepresented). Meili-fed grid cards are correct, so the same product displays contradictory finish info side by side. Fix: derive from variant metadata union, as buildWheelDocument does.

## 10. [MEDIUM] Product-level centerBoreMm/loadRatingLb taken from variants[0] though bores vary — wrong spec row, bore gate, and reverse-fitment filter

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/product-detail/data/get-product.ts:82` | **Found by:** spec:pdp-data-honesty
- **Evidence:** mapToDetail reads rep = variants[0].metadata and sets specs.centerBoreMm/loadRatingLb from it (get-product.ts:34, 81-82). Post-WB-059 one product merges variants with DIFFERENT bores/loads — the PDP ships bore/load SpecSelectors driven by boresFor/loadsForBore (hero/index.tsx:213-230). Yet (a) the Specs grid renders one product-wide 'Center bore' (spec-rows.ts:18), (b) fitsVehicle's hub-bore hard gate uses only this bore (fits-vehicle.ts:26-27), and (c) getProductDetail passes it as the reverse-fitment boreMm filter (get-product.ts:117-119).
- **Impact:** For multi-bore products the fitment band can say 'Doesn't fit — wheel bore smaller than your hub' when another variant's bore clears (buildFitView finds it, so band and fit-mode disagree), the confirmed-models list is filtered by an arbitrary variant's bore, and the WB-056 honesty spec's own grid shows a bore that may not apply to the selected variant.

## 11. [MEDIUM] Fit-mode discovery silently truncates at 200 Meilisearch candidates — fitting wheels beyond the cap unreachable, totalCount lies

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/discovery/data/get-products.ts:170` | **Found by:** spec:fitment-catalog-search, spec:wheel-size-garage, spec:fitment-aware-pdp, domain:discovery-meili
- **Evidence:** When ?fit is active, fetchDiscoveryProducts runs ONE Meili query with `limit: FIT_CANDIDATE_CAP` (200), `offset: 0` (lines 170-179), then post-filters and paginates in memory with `totalCount: fitting.length` (line 210). No check of estimatedTotalHits vs the cap, no follow-up page, no UI/log signal on overflow. The cap is taken in the active sort order, so under sort=price-asc only the 200 cheapest candidates ever enter the fit result. Catalog is 1,724 wheel groups, most multi-pattern; common patterns (6x139.7, 5x114.3) can match >200. The tire fit path has the same cap (get-tire-products.ts:155). Non-fit mode has maxTotalHits raised to 10000 (medusa-config.js:273).
- **Impact:** Which wheels a shopper can EVER see in fit mode depends on the active sort (candidates cut to first 200 pre-filter), the header renders the capped number as the exact result count, facet counts omit real inventory, and fitting products past the cap appear on NO page with no 'showing top N' indicator. STATUS.md documents the cap but not this silent-truncation failure mode.

## 12. [MEDIUM] Fit mode silently drops disjunctive facet counting — selecting any filter value hides all sibling options in the rail

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/discovery/data/get-products.ts:212` | **Found by:** spec:fitment-catalog-search, domain:discovery-meili
- **Evidence:** Non-fit mode runs one facet query per dimension with that dimension's own filter skipped (buildFilters(query.filters, query, facetQueryByDim[field]), lines 234-244) — proper disjunctive counting per design spec §6. Fit mode instead computes facets from the single fully-filtered `fitting` set (facets: facetsFromProducts(fitting)); the candidate query at line 176 applies ALL filters with no skip. Same in tires: get-tire-products.ts:162 builds filters with skip=undefined and line 180 recomputes facets from the fitting set only.
- **Impact:** In fit mode, checking 'Brand: Fuel' makes every other brand vanish from the Brand section, so multi-select within a dimension — which works in normal browse — becomes impossible once a vehicle fit is applied. Selected-dimension siblings drop to zero, blocking within-dimension pivots in the flagship fitment flow.

## 13. [MEDIUM] Fit-mode discovery caches coarse over-claiming results for 60s when the Store API variant fetch fails

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/discovery/data/get-products.ts:197` | **Found by:** spec:discovery-vendor-ops
- **Evidence:** In the fit branch, a failed sdk.store.product.list is caught (variantsById = {}), `fetched` becomes false, and ALL bolt-pattern candidates pass unverified (`!fetched || productHasFittingVariant(...)`, lines 202-205). The function returns normally, so the WB-021 unstable_cache wrapper (lines 282-287) caches this degraded result for 60s under the fit key — contradicting the design contract that failures 'throw past the cache and degrade to empty (uncached), so a blip self-heals' (comment lines 273-276; spec §WB-021).
- **Impact:** Under a vehicle-fit filter, users are shown wheels whose matching bolt pattern exists only in non-fitting sizes/bores as if they fit — the exact over-claim WB-060 fixed — and the wrong list stays pinned in the cache for up to 60s per query key even after the Store API recovers, with only a server console.error as signal.

## 14. [MEDIUM] Switching payment provider after a session exists never re-initiates it — order placed with the OLD provider while UI shows the new one

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** business-logic-bug | **Where:** `storefront/src/modules/checkout/components/payment/index.tsx:91` | **Found by:** domain:cart-checkout
- **Evidence:** handleSubmit (payment/index.tsx:85-110) calls initiatePaymentSession only `if (!activeSession)`. With an existing session (e.g. Manual), selecting Stripe re-initiates nothing; the button reads 'Continue to review' and is enabled because isStripe derives from activeSession.provider_id (line 43), not the selection. The review summary shows the SELECTED method title (lines 236-237), but PaymentButton dispatches on payment_sessions[0] (payment-button/index.tsx:38) — the stale session.
- **Impact:** A user who picked Manual then switched to 'Credit card' sees 'Payment method: Credit card' at review, yet ManualTestPaymentButton renders and places an unpaid order. Reverse direction (Stripe→Manual): the Stripe button renders with no completed card element, so 'Place order' silently no-ops (early return at payment-button/index.tsx:120-123).

## 15. [MEDIUM] Checkout hardcodes address_2 to "" and the form has no unit field — saved addresses lose their apartment number at checkout

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/lib/data/cart.ts:272` | **Found by:** domain:cart-checkout
- **Evidence:** setAddresses sends address_2: "" for both shipping (cart.ts:272) and billing (cart.ts:291), and the checkout ShippingAddress form (shipping-address/index.tsx:102-174) has no address_2 input; setFormAddress (lines 37-53) also omits address_2 when hydrating from a saved address. Yet the account section explicitly collects address_2 (add-address.tsx:92) and the checkout address picker displays it (address-select/index.tsx:92-93).
- **Impact:** A customer who selects their saved address '123 Main St, Apt 4B' at checkout gets the order addressed to '123 Main St' — the unit number is silently stripped from the cart's shipping and billing address and therefore from the order and shipping label. For bulky freight like wheels, misdelivery/return costs are real, and the picker showed the full address so nothing warns the customer.

## 16. [MEDIUM] Promo-code error surface is dead wire: useFormState(submitPromotionForm) is never connected, so invalid codes fail silently

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** code-bug | **Where:** `storefront/src/modules/checkout/components/discount-code/index.tsx:43` | **Found by:** spec:checkout-cart
- **Evidence:** Line 43: `const [message, formAction] = useFormState(submitPromotionForm, null)` — but formAction is never used; the form's action is addPromotionCode (line 48). `message` therefore can never be set, so `<ErrorMessage error={message} />` (lines 83-86) is permanently null. addPromotionCode (lines 30-41) also clears the input unconditionally after applyPromotions, and Medusa v2 updateCart({promo_codes}) does not reject unknown codes — it simply omits them.
- **Impact:** A customer who types an invalid/expired promo code gets zero feedback: the input clears, no badge appears, no error shows. They plausibly believe the discount applied and place the order at full price. If applyPromotions ever throws, the rejection escapes the client handler instead of reaching the inline error UI. This is the exact component WB-036 rewired, so the dead wire survived the fix.

## 17. [MEDIUM] 'Free shipping $199+' promised on home, PDP, and checkout — backend charges flat $10 shipping on every order

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/product-detail/data/pdp-config.ts:24` | **Found by:** domain:money-pricing
- **Evidence:** pdp-config.ts:24 defines FREE_SHIP_THRESHOLD_USD=199 and line 31 renders 'Free shipping / Orders $199+' in the PDP trust strip; home merchandising.ts:10+25 says 'Free shipping $199+ … 2–3 day delivery'; checkout TrustStrip repeats it. Backend: both seeded shipping options are price_type 'flat' amount 10 with no cart-total price rule (seed.ts:256-320); grep for '199'/free-shipping rules across backend/src finds nothing, and update-shipping-zones.ts only touches geo zones. Checkout Totals only shows 'FREE' when shipping_total===0, which never happens.
- **Impact:** Every wheel order clears $199 (catalog min prices are hundreds of dollars), so effectively 100% of customers are promised free shipping on three surfaces and then charged $10 at checkout. Distinct from tracked WB-031 (placeholder option names/replyTo): a specific hard-coded policy claim with no backing price rule — add a conditional shipping price or remove the copy.

## 18. [MEDIUM] Home generateMetadata emits 'Authorized dealer for 0 premium aftermarket wheel brands' when Meilisearch is down or empty

- **Status:** PENDING VERIFICATION — single-reviewer claim, not yet adversarially checked
- **Kind:** ux-honesty | **Where:** `storefront/src/app/[countryCode]/(main)/page.tsx:19` | **Found by:** spec:home-merchandising
- **Evidence:** generateMetadata interpolates brandCount unconditionally: description: `Authorized dealer for ${brandCount} premium aftermarket wheel brands...`. getHomeCatalog → getDiscoveryProducts swallows Meili failures into an empty result (get-products.ts:288-291 returns emptyResult with facets.brands = {}), so brandCount = 0 on any Meili outage or pre-index state. The sibling consumers both guard this: hero/index.tsx:36 and trust-strip/index.tsx:6 fall back when brandCount is falsy. The metadata path — WB-028's whole point was replacing the fabricated '40+' claim — has no such guard.
- **Impact:** During any Meilisearch failure window the home page serves an SEO/social meta description claiming '0 premium aftermarket wheel brands' — a wrong, self-damaging claim that crawlers and link-preview caches can persist long after the outage ends.

## 19. [LOW] PDP hides the selector when an axis branches on null-vs-value, making one genuinely distinct variant unreachable

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `storefront/src/modules/product-detail/data/group-sizes.ts:123` | **Found by:** spec:wheel-axis-collision
- **Evidence:** The backend treats null-vs-value as DISTINCT variants ('null-vs-value differ' — design doc §1; formatOptionalAxis sentinel in wheel-grouping.ts:47-49), but boresFor/loadsFor filter nulls out via sortedDistinct(xs.filter((x) => x != null)) (group-sizes.ts:123-134). A (size, offset) with variants at bore 78.1 and bore null yields availableBores=[78.1] → length 1 → no selector rendered (hero/index.tsx:213), and resolveLeafVariant's availability sort picks one arbitrarily.
- **Impact:** When the vendor omits center bore or load rating on some rows of a group (the exact condition the sentinel was designed for), one of two physically different, separately-priced variants is invisible and unpurchasable on the PDP — silently contradicting the spec's 'no genuinely-distinct SKU is ever dropped' guarantee at the storefront layer.

## 20. [LOW] PDP default finish is alphabetical, not the design's in-stock-first representative

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `storefront/src/modules/product-detail/data/finish-options.ts:38` | **Found by:** spec:finish-as-variant
- **Evidence:** Design (docs/done/specs/2026-06-27-finish-as-variant-design.md Part 4) promises: 'Default finish = rep (in-stock-first). Top-level priceCents/lead image come from the default finish.' buildFinishOptions sorts by a.raw.localeCompare(b.raw) (finish-options.ts:38) and the hero defaults to finishOptions[0]?.raw (hero/index.tsx:57-59); mapToDetail's priceCents is min across ALL variants (get-product.ts:39-43), thumbnail is the rep (lowest part-number) finish image.
- **Impact:** A product whose alphabetically-first finish is entirely out of stock opens on an unbuyable finish even when other finishes are in stock; the PDP lead image can also differ from the Discovery card thumbnail and from the 'from' price's finish, so the click-through shows a different color than the card the shopper clicked.

## 21. [LOW] PDP price and CTA totals round to whole dollars — quoted price differs from what the cart actually charges

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** ux-honesty | **Where:** `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:31` | **Found by:** spec:pdp-add-to-cart, spec:pdp-bolt-pattern-axis, spec:pdp-correctness-polish, domain:money-pricing
- **Evidence:** formatUsd = `$${Math.round(cents / 100).toLocaleString()}` (lines 31-32) drives the headline price (line 135) and the Add-to-cart/Buy-now totals via formatUsd(unitPriceCents * quantity) (lines 213, 239); the same Math.round(cents/100) pattern appears in discovery/tire product cards, active-chips, home featured-blocks, and the tire purchase panel. Catalog MSRPs are .99-style dollar values (CLAUDE.md price convention, e.g. 369.99), and cart/checkout charge the exact amount.
- **Impact:** A $369.99 wheel displays as $370 and 'Add to cart · $1,480' for qty 4 while the cart charges $1,479.96; prices ending .01-.49 round DOWN so the button can under-quote what checkout charges. Small per line, but a systematic PDP-vs-cart price disagreement on essentially every product.

## 22. [LOW] WB-048 BLANK placeholder still leaks onto related and featured product cards

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** spec-gap | **Where:** `storefront/src/modules/product-detail/data/get-product.ts:175` | **Found by:** spec:pdp-correctness-polish
- **Evidence:** getRelatedProducts maps `boltPattern: String(m.bolt_pattern_raw ?? "")` with no isRealBoltPattern filter (get-product.ts:175); get-featured.ts:35 does the same from variants[0]. DiscoveryProductCard renders it verbatim: `{product.diameter}" · {product.boltPattern}` (discovery/components/grid/product-card.tsx:81), and the PDP related rail reuses that card. The WB-048 fix filtered placeholders only in mapToDetail/groupVariantsIntoSizes.
- **Impact:** A related or curated-featured card for a product whose first variant carries the vendor placeholder shows '18" · BLANK' (or a dangling '18" · ') — the exact placeholder-as-data defect WB-048 was raised to eliminate, surviving on two adjacent surfaces.

## 23. [LOW] WB-034 removed the cart qty-select ceiling entirely — one <option> per unit of live stock, no order-size sanity cap

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** code-bug | **Where:** `storefront/src/modules/cart/components/item/index.tsx:86` | **Found by:** spec:checkout-cart
- **Evidence:** Line 46: `const maxQuantity = maxSelectableQty(item.variant as any, item.quantity)` returns the raw aggregate inventory_quantity for managed, non-backorder variants (max-qty.ts line 24: Math.max(stock, currentQty) — no upper clamp). Lines 86-95 then render Array.from({ length: maxQuantity }, ...) options. The old Math.min(maxQuantity, 10) clamp was deliberately dropped per the plan, but nothing replaced it, and vendor-sync warehouse stock for popular SKUs is routinely in the hundreds.
- **Impact:** A cart line for a high-stock wheel renders a select with hundreds or thousands of option nodes (DOM bloat, unusable dropdown on mobile) and lets a customer select e.g. qty 800 with no order-size sanity cap — an order no retail flow downstream is prepared for.

## 24. [LOW] Trust-strip separator logic applies 2-col mobile math on the 4-col desktop row — missing middle divider + doubled half-width hairline

- **Status:** PENDING — low severity, below the verification cap
- **Kind:** code-bug | **Where:** `storefront/src/modules/home/components/trust-strip/index.tsx:22` | **Found by:** spec:home-merchandising
- **Evidence:** The comment (lines 21-24) says 'On small+, separators only between items', but the borders are computed once with 2-col assumptions and applied at all breakpoints: isLastInRow = (i + 1) % 2 === 0 suppresses borderRight for i=1, so on the desktop small:grid-cols-4 single row there is NO vertical divider between items 2 and 3; and isLastRow = i >= ITEMS.length - 2 gives items 0 and 1 a borderBottom that on desktop sits directly on the container's own borderBottom (lines 14-17), doubling the hairline under only the left half of the strip.
- **Impact:** Visible chrome defect on every desktop home render: an asymmetric trust strip (one missing column divider, a 2px-vs-1px bottom rule under half the strip), contradicting the component's own documented intent.

