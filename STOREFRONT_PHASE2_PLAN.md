# Storefront Phase 2 — Backend Gap Inventory

A roadmap inventory of backend work the storefront depends on. This is NOT a design spec for any single feature; each gap below would get its own design + plan when it comes up for build.

Audience for the storefront is **B2C consumers** (end drivers buying for their own vehicle); the B2B portal angle is intentionally out of scope.

Companion docs:
- [`VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md`](VENDOR_SYNC_IMPLEMENTATION_SUMMARY.md) — Phase 1 (inventory sync) state.
- [`CLAUDE.md`](CLAUDE.md) — project-level conventions.

---

## Recently shipped (Spec 1)

The fitment-ready catalog + faceted search work is live on this branch ([spec](docs/superpowers/specs/2026-05-28-fitment-ready-catalog-search-design.md), [plan](docs/superpowers/plans/2026-05-28-fitment-ready-catalog-search.md)).

- **Closed:** gap 2.3 (Search facets) for **wheels**. Tires remain pending — they need a separate spec (different facet axes, plus a tire grouping rule that does not exist yet).
- **Substrate for gap 2.1 (Fitment) is wired:** `bolt_patterns_canonical` is the indexed join key with wheel-size.com; `DiscoveryQuery.vehicleConstraint?: string[]` is the Meilisearch-filter seam Spec 2 fills; `canonicalBoltPatterns` is a shippable shared util the fitment client will reuse verbatim. Spec 2 is therefore a thin filter-derivation layer over the existing index, not a new subsystem.

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
| 2.1 | Fitment data | Vehicle-to-SKU compatibility mapping. **WheelPros ships no fitment data.** Source: [wheel-size.com REST API](https://developer.wheel-size.com/) on the Basic tier (~$450/yr, 5k hits/day, single API-key auth). Granularity is finer than feared — `/modifications/` is the leaf endpoint, returning trim × body × engine per model-year; drivetrain is a string inside `trim_attributes[]`. TPMS is **not** in the response (separate sourcing problem for §2.5). **Lazy-cache architecture:** call `/search/by_model/` when a real user adds a vehicle to their garage, call `/by_rim/search/` when a real user opens a wheel PDP, persist responses in our DB indefinitely. TOS forbids bulk pre-fetching or cron-driven cache warming — caching is permitted only on responses to human-initiated calls. Implications: §2.3 facets can't pre-index fitment, and PDP "fits these vehicles" populates lazily on first organic visit. **Spec 1 wired the substrate:** `bolt_patterns_canonical` is indexed + filterable on every wheel doc (canonical "{count}x{pcd_mm}" snapped to standard PCD — the wheel-size.com join key); `DiscoveryQuery.vehicleConstraint?: string[]` is the Meilisearch-filter seam already plumbed through `/store`; `canonicalBoltPatterns` is a shareable util. Spec 2 is a thin filter-derivation layer over the existing index, not a new subsystem. | — | L |
| 2.2 | Vehicle garage | Customer saves vehicle(s); storefront filters and recommends from them. New `customer_vehicle` table linked to Medusa customers. | 2.1 | M |
| 2.3 | ✓ Search facets (wheels) | **Wheels done (Spec 1).** The Meilisearch product index now carries the full wheel facet axes — `brand`, `finish`, `diameters`, `widths`, `bolt_patterns`, `bolt_patterns_canonical`, `offsets`, `center_bores`, `price_min`, `price_max`, `product_type` — plus sortable `price_min`, `created_at`, `title`. Indexing is driven by a per-product transformer in [`backend/src/modules/vendor-sync/search/build-search-document.ts`](backend/src/modules/vendor-sync/search/build-search-document.ts), wired in `medusa-config.js`. Discovery (`/store`) performs disjunctive faceted multi-search against this index. **Tires still pending** — they need a separate spec (different facet axes, plus a tire grouping rule that does not exist yet). | — | done (wheels) / S+M (tires) |
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
1.1, 1.2, 1.3, 1.4, 2.6 (MAP policy + minimum implementation). After this you can launch a generic-but-functional storefront. (2.3 wheels shipped via Spec 1; tire facets carry forward into a later tire-specific spec.)

**Phase 2b — Industry features (≈ 3-5 weeks, fitment dominates)**
2.1 (fitment ingestion — Spec 2 leverages the Spec 1 substrate, so this is a thin filter-derivation layer over the existing index + a persistent-garage swap rather than the originally-feared XL), 2.2 (garage), 2.4 (set-of-4), 2.5 (TPMS), 2.7 (brand pages). After this the site IS a wheels-and-tires storefront, not a generic shop.

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
| 2.1 Fitment | **Resolved 2026-05-27.** Source: wheel-size.com Basic tier (~$450/yr, 5k hits/day). Schema: `/modifications/` returns trim × body × engine per model-year (drivetrain as a string in `trim_attributes[]`); reverse lookup via `/by_rim/search/`. Commercial use is permitted — we are a customer of fitment data, not a competitor to wheel-size.com itself; caching is permitted on responses to human-initiated calls (no automated bulk fetch or warming). Residual one-time items before build: validate response shape with a Sandbox key against ~5 known vehicles; one-time legal pass on Russia governing law + $100 liability cap + AS-IS data disclaimer; source TPMS data separately for §2.5. |
| 2.6 MAP enforcement | What does the dealer agreement with WheelPros actually require? "MAP" by itself is ambiguous; the legal answer dictates the technical policy. |
| 3.1-3.5 Drop-ship | What channel does WheelPros use for PO submission and status (SFTP folder structure, sFTP file naming, real API endpoint)? Cadence of status files? |
| 1.3 Sales tax | Are you committing to TaxJar/Avalara monthly cost, or building per-state rates manually? Wholesale dealer license sometimes complicates this. |

---

## How this doc relates to design specs

This file is a backlog inventory. Each gap above, when picked up, gets its own design + plan in the normal brainstorming → spec → implementation cycle. The order in which we tackle them is whatever you and I agree on next; the phasing above is a recommendation, not a commitment.
