# QA Tester Report — Triage & Defect Register (2026-07-29)

> Source: `Wheel_Builds_QA_Checklist.xlsx` (tester: ghufran.ahmed2903@gmail.com, filled
> 2026-07-28), run against the live storefront `storefront-production-0088.up.railway.app`.
> 8 sheets: README + 6 test tabs + a free-form `ADDITIONAL` tab. A 7th tab
> (Performance / SEO / Security) is named in the README but **was never created** —
> nothing was tested there.
>
> **Scope rule (client, 2026-07-29): `TO TEST` rows are excluded** — they were never
> exercised, so they are not defects. This register covers only rows the tester marked
> `FAIL` / `PASS BUT`, plus every line of the `ADDITIONAL` tab.
>
> **Email rule (client, 2026-07-29):** items that need Resend are **not deployable** —
> no sending domain yet, site still on a `railway.app` host. Their *logic* is still
> in scope: build and test it so it works the day DNS + Resend are configured.

## How to read this

Every issue has a stable `Q-NN` id used by the specs and commits that follow.
`Verified` records what **this triage** independently reproduced today, not what the
tester asserted — several tester notes were qualified ("confirm in browser it isn't
just JS-lazy") and two turned out to have a different root cause than reported.

| Field | Meaning |
|---|---|
| **Verified** | `CONFIRMED` (reproduced today) · `PARTIAL` (real, but different cause than reported) · `NOT REPRODUCED` (works today) · `UNVERIFIED` (needs a browser/checkout session) |
| **Severity** | Re-graded by this triage where the tester's grade and the evidence disagree. Tester's grade kept in parentheses. |
| **Kind** | `code` · `data` · `ops/config` · `content` |

---

## Summary

**19 distinct issues** (the tester's 10 `FAIL`/`PASS BUT` rows + 12 `ADDITIONAL` lines,
with duplicates merged — `Q-18` is a reserved id, not an issue).

| Severity | Count | Ids |
|---|---|---|
| Critical | 2 | Q-01, Q-02 |
| High | 6 | Q-03, Q-04, Q-05, Q-06, Q-07, Q-20 |
| Medium | 8 | Q-08, Q-09, Q-10, Q-11, Q-12, Q-14, Q-15, Q-16 |
| Low | 2 | Q-13, Q-17 |
| Split | 1 | Q-19 — High as a launch gate, Low as a code defect |

By kind: **13 code**, **4 ops/config**, **1 data**, **1 content+code**.

**Two headline corrections to the tester's report:**

1. **The "empty filters" (Q-10 / Q-11) are not empty.** The facet data is complete —
   all 46 canonical bolt patterns and the tire sizes / 16 speed ratings / 80 load
   indexes are in the page payload. Those accordion sections are **collapsed by
   default** and Radix unmounts collapsed content, so they read as empty until clicked.
   Real defect, different fix. **Follow-on discovery (WB-120):** the tire size facet's
   "500 values" turned out to be the `maxValuesPerFacet` ceiling, not the real total —
   the catalog has **699** distinct sizes, so 199 were genuinely missing from the filter.
   Ceiling raised to 2000.
2. **The "In stock only" toggle works** on both `/store` and `/tires` (verified: 1447 →
   1138 wheels, 611 → 399 tires, zero OUT OF STOCK badges on the filtered pages). The
   tester's out-of-stock complaint (Q-03) is about the **search drawer's Trending
   tiles**, which are "newest 3" with no availability gate at all.

---

## Cluster C1 · Checkout & money integrity `[CRITICAL]`

Everything a shopper sees between "add to cart" and "pay". Two Criticals live here, and
they are launch-blocking: a customer cannot be asked to enter a card next to numbers
that don't add up.

### Q-01 · Cart shows $0 in the main price field
- **Verified:** **CONFIRMED + ROOT-CAUSED** (live cart captured 2026-07-29; fixed in WB-118)
- **Severity:** Critical (tester: none given) · **Kind:** code
- **Tester:** *"CART PRICE SHOWING 0 IN MAIN FIELD, SHOWING CORRECT PRICE BELOW THO"*
- **Evidence:** [`line-item-unit-price/index.tsx:26`](../../../storefront/src/modules/common/components/line-item-unit-price/index.tsx) reads
  `lineItemAmounts(item).unitPrice`; the "correct price below" is a different component
  reading a different field. A $0 unit price beside a correct line total means the two
  disagree about where price comes from.
- **⚠️ The obvious hypothesis is WRONG.** `lineItemAmounts` uses `item.unit_price ?? …`,
  and `??` won't fall back on a `0` — tidy, and it fits the symptom. But
  `@medusajs/utils/.../totals/line-item/index.js` derives `subtotal` and `total` **from**
  `unit_price × quantity` and passes `unit_price` through unchanged, so a zero
  `unit_price` would zero the line total too — and the tester says the total was correct.
  Something else is rendering `$0.00`.
- **Why it matters:** the single most trust-destroying number on the site. It also
  looks like a free item, which invites a support ticket on every order.
- **ROOT CAUSE (from the live capture):** the zero is the line **TOTAL**
  (`data-testid="product-price"`, rendered by `LineItemPrice`), **not** the unit price.
  The Store API cart response carries **no `total` key on a line item at all** — its whole
  key set is `id/quantity/unit_price/tax_lines/adjustments/product/variant/…`, i.e.
  per-line totals are not decorated on that response, only cart-level ones are. So
  `item.total ?? 0` rendered `$0.00` while `unit_price` (333) was perfectly correct — the
  **mirror image** of the hypothesis above. The same bug was present a second time in
  `checkout-summary`'s own `LineItemRow`.
- **Fixed** in WB-118 (`c3c1db2`): `lineItemAmounts` derives each amount from the other,
  staying entirely within stored amounts. Evidence:
  [`wb-118-task1-findings.md`](../../in-progress/plans/wb-118-task1-findings.md).

### Q-02 · Checkout summary math does not add up
- **Verified:** **CONFIRMED** — root-caused from the installed Medusa 2.13.6 source
- **Severity:** Critical (tester: none given) · **Kind:** code
- **Tester:** *"math not adding up in summary (during checkout)"*
- **Evidence:** `@medusajs/utils/dist/totals/cart/index.js` (`decorateCartTotals`):
  `subtotal = Σ item.subtotal + Σ shippingMethod.subtotal` (lines 66 **and 87** — shipping
  is inside `subtotal`); `taxTotal = itemsTaxTotal + shippingTaxTotal` (106);
  `total = (subtotal + taxTotal) − discountSubtotal − creditLinesTotal` (111-112);
  `shipping_total = Σ shippingMethod.total`, tax included (92).
  Both [`cart-totals`](../../../storefront/src/modules/common/components/cart-totals/index.tsx)
  and checkout's `Totals` render `subtotal − discount_total + shipping_total + tax_total`,
  which **(a)** counts shipping twice — its subtotal is already in `subtotal` and its tax
  already in `tax_total`; **(b)** subtracts `discount_total` where the real formula
  subtracts `discount_subtotal`; **(c)** never shows `credit_line_total`.
- **Corollary:** the `/cart` label "Subtotal (excl. shipping and taxes)" is factually
  wrong — it excludes taxes but *includes* shipping.
- **Why it matters:** same trust problem as Q-01, at the moment of payment. Also a
  chargeback risk if the charged total differs from the displayed total.
- **Relationship to Q-05:** with shipping at $0 the double-count is invisible; the flat
  fee on every order is what makes it visible. **Q-02 and Q-05 are one bug wearing two
  hats** — which is why the tester reported both.

### Q-05 · Free-shipping-over-$199 rule is not in effect; flat fee on every order
- **Verified:** CONFIRMED (by code + ops trail)
- **Severity:** High (tester: Medium) · **Kind:** ops/config
- **Tester:** *"$11 ADDED ON EVERY SHIPPING"* (checklist row 3-8)
- **Evidence:** [`update-shipping-prices.ts`](../../../backend/src/scripts/update-shipping-prices.ts)
  exists to add a `$0` price gated on `item_total >= 199`, and is guarded by
  `--confirm-host` so it only runs deliberately. The live behaviour shows a flat fee at
  every basket size, i.e. **the script was never run against production**.
- **Why it matters:** home, PDP and checkout all advertise "Free shipping $199+". The
  site is currently charging for something it promises for free — a consumer-protection
  problem, not just a bug.
- **Fix direction:** ops step (run the script against prod), plus a check that the
  advertised threshold and the configured rule are read from one place so they cannot
  drift again.

### Q-06 · Every US state is taxed the same
- **Verified:** CONFIRMED (by code + ops trail)
- **Severity:** High (tester: none given) · **Kind:** ops/config
- **Tester:** *"same tax in different states (chicago and california tested)"*
- **Evidence:** [`create-us-tax-region.ts:101-107`](../../../backend/src/scripts/create-us-tax-region.ts)
  creates a **country-level** US tax region with no default rate and explicitly leaves
  per-state province regions to be entered in admin. If a single US-level rate was
  entered instead of per-state rates, every state returns that one rate — exactly the
  observed symptom.
- **Why it matters:** collecting the wrong sales tax is a legal exposure, in both
  directions (under-collecting creates liability; over-collecting is a refund).
- **Open decision:** per-state rates entered manually for nexus states only, or a real
  tax provider (Stripe Tax / TaxJar)? See *Open decisions* below.

### Q-07 · Address form accepts a city in the state field and vice-versa
- **Verified:** UNVERIFIED (needs a checkout session)
- **Severity:** High (tester: none given) · **Kind:** code
- **Tester:** *"maybe not an issue but adding city in state field and state in city field
  gets no error, during card charge"*
- **Why it matters:** the tester hedged, but this is not cosmetic — a malformed state
  is what Q-06's tax lookup keys on, and it is what the carrier rates against. Garbage
  in the state field silently produces the wrong tax and an undeliverable label.
- **Fix direction:** constrain state to a US state select/validated code on the shipping
  and billing address forms; validate before the payment step, not after.

### Q-08 · Card form does not collect a postal code
- **Verified:** UNVERIFIED (needs a checkout session)
- **Severity:** Medium (tester: none given) · **Kind:** code
- **Tester:** *"zip also needed in card details"*
- **Why it matters:** postal-code (AVS) checks are a primary card-fraud control and
  several issuers decline without it. Stripe's Payment Element can collect it directly.
- **Fix direction:** enable postal-code collection on the Stripe element, or map the
  billing address's ZIP into the payment method.

### Q-09 · Standard and Express shipping cost the same
- **Verified:** CONFIRMED (by seed config)
- **Severity:** Medium (tester: none given) · **Kind:** ops/config
- **Tester:** *"both shipping methods have same pricing"*
- **Evidence:** both options are seeded flat and
  [`update-shipping-prices.ts:65`](../../../backend/src/scripts/update-shipping-prices.ts)
  treats `["Standard Shipping", "Express Shipping"]` identically.
- **Why it matters:** offering a paid upgrade that costs the same as the free option is
  a dark-pattern-shaped mistake; shoppers who pick Express expect to have paid for speed.
- **Open decision:** real prices and transit times for each method. See *Open decisions*.

---

## Cluster C2 · Availability truth `[HIGH]`

### Q-03 · Search drawer's Trending tiles surface out-of-stock products with no badge
- **Verified:** CONFIRMED
- **Severity:** High (tester: High) · **Kind:** code
- **Tester:** row 1-6 *"Shows out of stock options as well. all 3 favorite searches shown
  are out of stock."* and ADDITIONAL *"favorite options shown are out of stock, all 3"*
  and *"in stock enabled, still showing out of stock options as well"* (all one issue).
- **Evidence:** [`trending-data.ts`](../../../storefront/src/modules/search/components/search-drawer/trending-data.ts)
  — `toTrendingProducts(newest, count = 3)` takes `newest.slice(0, 3)` and maps to
  `{ handle, brand, name, priceCents, finish }`. `DiscoveryProduct.inStock` exists and
  is **dropped by the mapper**, so the tile can neither filter nor badge on it.
  [`(main)/layout.tsx:27`](../../../storefront/src/app/[countryCode]/(main)/layout.tsx)
  passes the unfiltered newest list.
- **Correction to the report:** the `/store` and `/tires` "In stock only" toggles are
  **not** broken. Measured today: `/store` 1447 → **1138** with `?in_stock=1` (Meili
  ground truth 1137) and **zero** OUT OF STOCK badges; `/tires` 611 → **399**, zero
  badges. The complaint is about the drawer, which has no such gate.
- **Fix direction:** prefer in-stock products when picking the 3 tiles, and carry
  `inStock` through to the tile so anything shown out of stock is badged like the grid
  cards already are.
- **Related:** WB-110 (already on the backlog — special-order products blanket-read
  OUT OF STOCK, which undercuts the PDP's correct "special order — contact us" copy).

---

## Cluster C3 · Discovery filters & count truth `[MEDIUM]`

### Q-10 · Bolt pattern filter reads as empty on `/store`
- **Verified:** PARTIAL — real, but the cause is *collapsed*, not *empty*
- **Severity:** Medium (tester: Medium) · **Kind:** code
- **Tester:** *"BUG: 'Bolt pattern' filter header renders with no options. Confirm in
  browser it isn't just JS-lazy."*
- **Evidence:**
  [`filter-sections.tsx:279`](../../../storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx)
  — `defaultValue={["brand", "diameter", "finish"]}`. `bolt-pattern` and `price` are
  omitted, and Radix `Accordion` unmounts collapsed content. The data is present: the
  page payload carries `"boltPatterns":{"10x170":8,"10x225":16,…}` — 46 canonical
  patterns, matching the index exactly.
- **Why it matters:** bolt pattern is the single most important wheel filter and the
  join key for fitment. A shopper who does not think to click the header concludes the
  site cannot filter by it.
- **Fix direction:** open the section by default, and/or show the available-value count
  on a collapsed trigger so "collapsed" never reads as "empty".

### Q-11 · Size / Speed rating / Load rating read as empty on `/tires`
- **Verified:** PARTIAL — same root cause as Q-10
- **Severity:** Medium (tester: Medium) · **Kind:** code
- **Evidence:**
  [`tire-discovery/.../filter-sections.tsx:279`](../../../storefront/src/modules/tire-discovery/components/filter-rail/filter-sections.tsx)
  — `defaultValue={["brand", "rim-diameter", "tire-type"]}`, which omits exactly the
  three sections the tester named plus `price`. Payload confirms the data is there:
  `sizes` (500 values), `speedRatings` (16), `loadIndexes` (80).
- **Note:** `tire_sizes` returns exactly 500 distinct values, which is the index's
  `maxValuesPerFacet: 500` ceiling — the list may be truncated. Worth confirming when
  this section is opened up, because a truncated size list is a silent miss.

### Q-12 · Style landing counts disagree with the listings they link to
- **Verified:** CONFIRMED
- **Severity:** Medium (tester: Medium/Low, rows 2-3 and 2-31) · **Kind:** code
- **Tester:** *"TRUCK N DUALLY / STREET STYLE"* and *"NUMBERS DONT MATCH"*
- **Evidence:** measured on live today —

  | Style | `/us/styles` tile claims | `/us/styles/<slug>` shows | |
  |---|---|---|---|
  | Street | 1550 wheels | 1076 results | ✗ |
  | Truck & Dually | 733 wheels | 490 results | ✗ |
  | Drag | 653 wheels | 593 results | ✗ |
  | Luxury | 602 wheels | 602 results | ✓ |
  | Off-road | 115 wheels | 115 results | ✓ |
  | UTV | 7 wheels | 7 results | ✓ |

- **Root-cause hypothesis (high confidence):** the tile count is a plain `style` facet
  count, while the listing applies the style **preset**, which also default-fills pinned
  dimensions (diameter etc.). Styles with no pinned dimension match; the three that
  disagree are the ones with one. This is the same seam as WB-112, and the same family
  as the WB-099 review finding that a preset was overriding rather than default-filling.
- **Why it matters:** the number on the tile is a promise. Clicking it and getting 30%
  fewer products reads as a broken catalog.

### Q-13 · Brand count differs between homepage and store filter
- **Verified:** **NOT REPRODUCED** (re-measured 2026-07-29 during WB-120)
- **Severity:** Low (tester: Low) · **Kind:** code
- **Tester:** *"'American Racing Forged' = 25 on homepage but 27 in store filter."*
- **Evidence:** Meilisearch says **25** for `product_type = "wheel"`. So the 27 is the
  outlier — likely an unscoped count that includes non-wheel or drafted docs.
- **Re-measurement (2026-07-29), all four agree on 25:**

  | Surface | Count |
  |---|---|
  | Homepage `ShopByBrand` tile | **25** |
  | `/brands` tile | **25** |
  | `/store` filter rail | **25** |
  | Meilisearch ground truth (`product_type = "wheel"`) | **25** |

  All three surfaces read the **same** `facets.brands` from one
  `getHomeCatalog()` react-cache hit, so they are structurally incapable of
  disagreeing. The catalog shifted slightly between the tester's run and this
  one (they recorded "1449 results", it is 1447 today), which is the likeliest
  explanation for the 27.
- **Resolution: no code written.** Inventing a fix for a defect that isn't
  there is how a real one gets introduced. Re-open with a screenshot if it
  recurs.

### Q-14 · Search bar quality
- **Verified:** UNVERIFIED (subjective; no failing query given)
- **Severity:** Medium (tester: none given) · **Kind:** code
- **Tester:** *"search bar needs to be improved"*
- **Note:** WB-087 already added `search_text`, synonyms and model-name titles. Without
  a failing query this is not actionable as a defect — see *Open decisions*: we need
  two or three searches that returned the wrong thing.

### Q-15 · Price filter should be a range slider
- **Verified:** CONFIRMED (as a known gap)
- **Severity:** Medium (tester: none given, "for optics") · **Kind:** code
- **Tester:** *"price range scroller like olx will look better for optics"*
- **Evidence:** already a tracked TODO in the code —
  [`filter-sections.tsx`](../../../storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx)
  carries `TODO(integration): replace the two TextInputs with a <Slider value={[min,max]}/>
  … once a real min/max range comes from Meilisearch's price aggregation`, and
  `storefront/CLAUDE.md` lists it as the remaining rail follow-up.
- **Note:** the slider needs a real min/max, which means surfacing a price aggregation
  from the index — it is not a pure UI swap.

---

## Cluster C4 · Support & lead capture `[HIGH — partly email-blocked]`

### Q-04 · Contact page offers no way to contact anyone
- **Verified:** CONFIRMED
- **Severity:** High (tester: High) · **Kind:** content + code
- **Tester:** *"BUG/RISK: fetched Contact page shows only 3 FAQ links — no visible form,
  email, or phone."*
- **Evidence:** live `/us/contact` served today contains **0 `<form>` elements, 0
  `<input>` elements, 0 `mailto:` links, 0 `tel:` links**.
- **Why it matters:** three separate surfaces send shoppers here and then dead-end them —
  the returns policy ("contact us before shipping"), the out-of-stock PDP CTA
  ("special order — contact us to order", WB-098), and the footer. Every special-order
  sale currently has no channel to arrive through.
- **Email dependency:** a *form* needs Resend to deliver. A `mailto:` + phone number
  does not. Recommend shipping the static channel immediately and the form behind the
  same code path that Q-20 uses.
- **Open decision:** the real support email address and phone number. See below.

### Q-20 · "Submit your vehicle for fitment check" leads nowhere
- **Verified:** UNVERIFIED (CTA located by tester, destination not yet traced)
- **Severity:** High (tester: none given) · **Kind:** code
- **Tester:** *"submit your vehicle for fitment check'' should lead to a form"*
- **Why it matters:** this is the site's core value proposition failing at the exact
  moment a shopper with an unsupported vehicle raises their hand. It is also the
  highest-intent lead the site can capture.
- **Fix direction:** one submission surface shared with Q-04, storing to the database
  first and emailing second, so a lead is never lost to an email outage — the same
  shape as the existing `newsletter` module.

### Q-19 · Order confirmation email never arrives `[EMAIL-BLOCKED]`
- **Verified:** CONFIRMED as not-deliverable-today (no sending domain)
- **Severity:** High as a launch gate, **Low as a code defect** · **Kind:** ops/config
- **Tester:** *"confirmation email — didnt receive any"*
- **Status:** **Out of scope for deployment per the client**, in scope for logic. WB-094
  already made the Resend provider fail-loud and rebuilt the templates; the blocker is
  that `RESEND_API_KEY` / `RESEND_FROM_EMAIL` cannot be issued for a `railway.app` host.
- **What we still do:** verify the subscriber → template → provider path end-to-end with
  a stubbed transport, so the day DNS lands it is a config change and not a debug session.
- **Deploy gate:** record in the go-live runbook — set `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `STOREFRONT_URL`, then run one live roundtrip.

---

## Cluster C5 · Catalog data honesty `[MEDIUM]`

### Q-16 · PDP shows "Center bore 999 mm"
- **Verified:** CONFIRMED
- **Severity:** Medium (tester: Medium) · **Kind:** data
- **Tester:** *"BUG: center bore shows '999 mm' — clearly a default/placeholder. Audit
  other PDPs for 999 / 0 / null specs."*
- **Evidence:** **45 wheel products** in the live index carry `center_bores: [999]` —
  Asanti Forged 832 / 862 / 868 among them. `999` is a WheelPros sentinel meaning
  *bore-to-order / custom*, which is genuinely what a forged wheel is; it is real feed
  data being rendered literally.
- **Why it matters:** WB-056 already established the principle — a spec we don't
  actually know must be hidden, not printed. `999 mm` is worse than hiding it, because
  it is a plausible-looking number.
- **Fix direction:** treat `999` as a sentinel at the transformer (same place `0` and
  `null` are already handled), and either hide the row or render the honest
  "custom / bore-to-order". Sweep for other sentinels while in there — the tester
  explicitly asked for the audit and called it "likely systemic".

---

## Cluster C6 · Routing hygiene `[LOW]`

### Q-17 · Uppercase paths 404 instead of redirecting
- **Verified:** CONFIRMED
- **Severity:** Low (tester: Low) · **Kind:** code
- **Tester:** row 1-15, `FAIL`, no note.
- **Evidence:** measured today — `/us/store/` → `308` → `/us/store` ✓, but
  `/US/STORE` → `307` → `/us/STORE` → **`404`**. The middleware lowercases the country
  code and stops; the rest of the path keeps its case and misses every route.
- **Why it matters:** small, but it is link-rot: any capitalised URL from an email,
  a printed asset or a mis-typed address dead-ends.
- **Fix direction:** lowercase the whole pathname in the same middleware redirect that
  already lowercases the country code.

### Q-18 · (reserved — merged)
Duplicate of Q-03; kept as an id so the tester's `ADDITIONAL` line numbering stays
traceable.

---

## Open decisions (blocking specific fixes, not the whole batch)

These are business calls, not engineering ones. Each blocks exactly one issue; every
other issue proceeds without them.

| # | Decision | Blocks | Why we can't pick a default |
|---|---|---|---|
| D1 | Real prices + transit times for Standard vs Express | Q-09 | Carrier rates are a commercial choice |
| D2 | Per-state tax rates for nexus states, or a tax provider (Stripe Tax / TaxJar) | Q-06 | Nexus is a legal/accounting determination |
| D3 | Support email address and phone number | Q-04 | Must be a mailbox that is actually monitored |
| D4 | Two or three searches that returned the wrong products | Q-14 | Not actionable as a defect without a repro |

---

## Explicitly out of scope

- **All `TO TEST` rows** (client instruction) — untested, not defects.
- **Tab 7 (Performance / SEO / Security)** — never created by the tester.
- **Resend delivery** (Q-19) — no sending domain. Logic in scope, delivery is not.

## Traceability

| Q id | Sheet | Row | Tester result |
|---|---|---|---|
| Q-01 | ADDITIONAL | D11 | free-form |
| Q-02 | ADDITIONAL | D14 | free-form |
| Q-03 | 1. Functional / ADDITIONAL | 6 / D3, D8 | PASS BUT / free-form |
| Q-04 | 4. Forms & Fitment | 16 | FAIL |
| Q-05 | 3. Cart & Checkout | 8 | FAIL |
| Q-06 | ADDITIONAL | D12 | free-form |
| Q-07 | ADDITIONAL | D13 | free-form |
| Q-08 | ADDITIONAL | D6 | free-form |
| Q-09 | ADDITIONAL | D5 | free-form |
| Q-10 | 2. Product & Catalog | 9 | FAIL |
| Q-11 | 2. Product & Catalog | 10 | FAIL |
| Q-12 | 2. Product & Catalog | 3, 31 | FAIL |
| Q-13 | 2. Product & Catalog | 27 | FAIL |
| Q-14 | ADDITIONAL | D7 | free-form |
| Q-15 | ADDITIONAL | D9 | free-form |
| Q-16 | 2. Product & Catalog | 17 | FAIL |
| Q-17 | 1. Functional | 15 | FAIL |
| Q-19 | ADDITIONAL | D4 | free-form |
| Q-20 | ADDITIONAL | D10 | free-form |
