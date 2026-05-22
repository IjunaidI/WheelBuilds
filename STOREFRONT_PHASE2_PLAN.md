# Storefront Phase 2 — Backend Gap Inventory

A roadmap inventory of backend work the storefront depends on. This is NOT a design spec for any single feature; each gap below would get its own design + plan when it comes up for build.

Audience for the storefront is **B2C consumers** (end drivers buying for their own vehicle); the B2B portal angle is intentionally out of scope.

Companion docs:
- [`VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md`](VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md) — Phase 1 (inventory sync) state.
- [`CLAUDE.md`](CLAUDE.md) — project-level conventions.

---

## Tier definitions

| Tier | Meaning |
|---|---|
| 1 | Blocks the storefront from working at all. Must close before any storefront launch. |
| 2 | Industry differentiators. Without these the site is generic e-com, not a wheels-and-tires site. |
| 3 | Operations. Required before going live to real customers, not before the first storefront cut. |
| 4 | Product-data depth and merchandising quality. |
| 5 | Growth/UX. Post-launch optimisation. |

Sizes are rough: S (≤ 1 day), M (2-5 days), L (1-2 weeks), XL (>2 weeks).

---

## Tier 1 — Blocks the storefront from working at all

| # | Gap | Detail | Size |
|---|---|---|---|
| 1.1 | Shipping options | `ensureShippingProfile` creates the profile but no `shipping_option` rates. Medusa checkout dies at the "select shipping" step until at least one option per region exists. Minimum first cut: a flat-rate per region. | S |
| 1.2 | Payment env | The Stripe provider is conditional on `STRIPE_API_KEY` + `STRIPE_WEBHOOK_SECRET`. Confirm dev/prod has both set. | S |
| 1.3 | Sales tax | Nothing configured today. Wheels/tires also incur state-specific tire-fee surcharges (CA, NY, others — $1-$5/tire for recycling). Two paths: TaxJar/Avalara integration, or manual per-state Medusa tax-rate config. | M-L |
| 1.4 | Customer account smoke test | Verify register/login/reset works end-to-end against current dev DB. Resend templates exist for invite-created and order-placed; password-reset template likely missing. | S |

## Tier 2 — Industry differentiators

| # | Gap | Detail | Dependency | Size |
|---|---|---|---|---|
| 2.1 | Fitment data | YMM-Submodel ↔ SKU mapping. Vehicle taxonomy is year × make × model × submodel × drive ≈ 10-50k vehicles. WheelPros ships a `FitmentData` feed (format and license terms not yet confirmed). New schema, new ingestion pipeline parallel to vendor-sync. **This is the elephant in Phase 2.** | — | XL |
| 2.2 | Vehicle garage | Customer saves vehicle(s); storefront filters and recommends from them. New `customer_vehicle` table linked to Medusa customers. | 2.1 | M |
| 2.3 | Search facets | Meilisearch indexes only `title/desc/sku/handle` today. Real wheel/tire search needs `filterableAttributes` for Bolt Pattern, Diameter, Width, Offset, Brand, Finish, Tire Size, Construction. Same plugin, larger index config. | — | S backend + frontend work |
| 2.4 | Set-of-4 quick add | Most wheel orders are 4. PDP default qty = 4, "Buy as set" button, optional lug-kit upsell. Backend already supports quantity; this is mostly storefront. | — | S backend + M frontend |
| 2.5 | TPMS upsell | Tires need TPMS sensors for newer vehicles. Single TPMS SKU offered as a qty-matched upsell on every tire PDP. Backend: manually create TPMS product + a related-product link. | — | S backend + M frontend |
| 2.6 | MAP enforcement | Vendor agreements typically forbid publicly displaying MAP. Policy options: show MSRP always, MAP only in cart, MAP only logged-in, click-to-reveal. Today MSRP is the variant price; MAP is in variant metadata but never surfaced. Policy is mostly a business/legal decision; the implementation follows. | — | M |
| 2.7 | Brand landing pages | Brand collections already exist (vendor-sync creates them). Need content fields (logo, description, hero image) and a category-style landing UX. | — | S backend + M frontend |

## Tier 3 — Operations (pre-production)

| # | Gap | Detail | Dependency | Size |
|---|---|---|---|---|
| 3.1 | Carrier shipping | UPS/FedEx/USPS real-time rates. LTL freight threshold for >150lb orders (set of 4 forged wheels). Dimensional weight. Residential surcharge. Some tire compounds are hazmat. | 1.1 | L |
| 3.2 | Multi-warehouse routing | We store stock per vendor warehouse but there's no router. Customer ZIP → choose warehouse(s). Decide: split shipments allowed or single-warehouse-only. | 3.1 | L |
| 3.3 | Drop-ship PO submission | On order placed: charge customer, then submit PO to WheelPros (SFTP or API). State machine: placed → po-submitted → vendor-confirmed → shipped → delivered. | — | L |
| 3.4 | Vendor status webhooks | Acknowledgment, shipped + tracking, backorder, cancellation. Likely polling SFTP for status files rather than real webhooks. | 3.3 | L |
| 3.5 | Inventory reservation + backorder | `vendor_product_current.totalQoh` is a snapshot; vendor stock changes between sync cycles. Customer can checkout 4 wheels we showed in stock and vendor only has 3. Need real-time reservation + backorder fallback. | 3.4 | M-L |
| 3.6 | Returns / RMA | Mounted tires are non-returnable. Wheels: restocking fee policy. Medusa has return workflows; need policy config + customer-facing UI. | — | M |
| 3.7 | Transactional emails | Today: order-placed, invite-created. Need: shipped + tracking, delivered, backorder, refunded, return-approved, return-received. | — | M |

## Tier 4 — Product-data depth

| # | Gap | Detail | Size |
|---|---|---|---|
| 4.1 | Wheel construction | Forged / cast / flow-formed. Not in the current CSV; either parse from PartDescription or accept manual data entry. | S-M |
| 4.2 | Image galleries per finish | One thumbnail today (vendor CDN). Customers expect face/lip/back angles. Vendor sometimes ships a separate photo-set feed. Needs image hosting + pipeline. | M |
| 4.3 | Tire UTQG / load / speed surfacing | All parsed already (loadIndex, speedRating, plyRating). Just need storefront UI to display them. | S |
| 4.4 | Tire compound classification | Performance / All-Season / A/T / M/T / Winter. Sometimes in PartDescription, sometimes Division. Affects fitment recommendations and category filtering. | S |
| 4.5 | Reviews | Build native (months) or buy SaaS (Yotpo, Stamped, Trustpilot — days). | S (SaaS) to L (native) |
| 4.6 | SEO + structured data | Schema.org Product/Offer/AggregateRating, breadcrumbs, sitemap, canonical URLs. Mostly storefront work but some product-level data must come from backend. | M |

## Tier 5 — Growth/UX

| # | Gap | Detail | Size |
|---|---|---|---|
| 5.1 | Wishlists | Server-side persistence so the list survives device changes. | M |
| 5.2 | Related products | Same-brand, same-vehicle, frequently bought together. "Same vehicle" depends on 2.1. | M (+ depends on 2.1) |
| 5.3 | Visualizer | "Show this wheel on my truck." Buy not build (Verus, WheelLink). | XL or SaaS |
| 5.4 | Abandoned cart | With vehicle context preserved. | M |
| 5.5 | Analytics | GA4, Meta Pixel. Mostly storefront. | S |
| 5.6 | B2B portal | B2C-only audience; defer indefinitely. | — |

---

## Recommended phasing

**Phase 2a — Storefront unblocking (≈ 1 week)**
1.1, 1.2, 1.3, 1.4, 2.3 (search index config), 2.6 (MAP policy + minimum implementation). After this you can launch a generic-but-functional storefront.

**Phase 2b — Industry features (≈ 3-5 weeks, fitment dominates)**
2.1 (fitment ingestion), 2.2 (garage), 2.4 (set-of-4), 2.5 (TPMS), 2.7 (brand pages). After this the site IS a wheels-and-tires storefront, not a generic shop.

**Phase 3 — Production hardening (≈ 2-3 weeks)**
3.1 → 3.5 in sequence (shipping → routing → PO → webhooks → reservation), 3.6 (RMA), 3.7 (emails). Required before significant real-customer traffic.

**Phase 4 — Merch + SEO (rolling)**
4.x as merchandising needs demand. 4.5 (reviews) and 4.6 (SEO) before any meaningful traffic acquisition spend.

**Phase 5 — Growth (post-launch)**
5.x as analytics tell you what moves conversion.

---

## Open questions blocking design work

These are not technical questions; they need information from outside the codebase before the corresponding gap can be designed.

| Gap | Open question |
|---|---|
| 2.1 Fitment | What does the WheelPros FitmentData feed actually contain? Format (CSV/XML/JSON), update cadence, license terms for redistribution? Third-party alternatives (PFYC, Ride Match) viable? |
| 2.6 MAP enforcement | What does the dealer agreement with WheelPros actually require? "MAP" by itself is ambiguous; the legal answer dictates the technical policy. |
| 3.1-3.5 Drop-ship | What channel does WheelPros use for PO submission and status (SFTP folder structure, sFTP file naming, real API endpoint)? Cadence of status files? |
| 1.3 Sales tax | Are you committing to TaxJar/Avalara monthly cost, or building per-state rates manually? Wholesale dealer license sometimes complicates this. |

---

## How this doc relates to design specs

This file is a backlog inventory. Each gap above, when picked up, gets its own design + plan in the normal brainstorming → spec → implementation cycle. The order in which we tackle them is whatever you and I agree on next; the phasing above is a recommendation, not a commitment.
