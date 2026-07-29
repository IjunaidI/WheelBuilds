# G13 · QA remediation — design

> **Status:** design approved 2026-07-29, awaiting spec review.
> **Source of findings:** [`2026-07-29-qa-tester-report-triage.md`](../../future/plans/2026-07-29-qa-tester-report-triage.md)
> — 20 issues (`Q-01`…`Q-20`) triaged from the tester's live-site QA pass.
> **Backlog ids:** WB-118 … WB-123.
> **Shape:** one epic, four waves, each its own branch + review gate — the same
> structure G11 and G12 used successfully in this repo.

## Why this shape

The 20 findings are not one problem. They span backend ops scripts, the checkout
money path, the discovery rail, the Meilisearch transformer, and Edge middleware.
Batching them into one branch would put two Critical money bugs in the same review
as a CSS-adjacent accordion default — and the per-wave reviews in G11/G12 each caught
a real regression that a bigger unit would have buried.

The waves are ordered by severity, with one deliberate exception noted in Wave 1.

**Decomposition:** this spec is deliberately larger than one implementation plan. Each
wave gets **its own plan, branch, and review gate**; they are executed one at a time, not
in parallel, so a money fix is never reviewed alongside a facet default.

| Wave | Backlog id | Theme | Issues | Apps touched |
|---|---|---|---|---|
| 1 | WB-118 | Checkout & money integrity | Q-01, Q-02, Q-05, Q-06, Q-07, Q-08 | storefront + backend scripts |
| 2 | WB-119 | Support & lead capture | Q-04, Q-19, Q-20 | storefront + backend module |
| 3 | WB-120 | Discovery & availability truth | Q-03, Q-10, Q-11, Q-12, Q-13, Q-15 | storefront |
| 4 | WB-121 | Catalog data honesty & routing | Q-16, Q-17 | backend + storefront |
| — | WB-122 | Search relevance | Q-14 | **deferred — blocked on a repro** |
| — | WB-123 | Express shipping differentiation | Q-09 | **deferred — blocked on carrier rates** |

## Non-goals

- **Resend delivery.** No sending domain exists (`railway.app` host). Wave 2 builds
  and tests the email path with a stubbed transport; turning it on is a config change
  recorded in the go-live runbook, not code.
- **`TO TEST` rows.** Never exercised by the tester; not defects (client instruction).
- **Tab 7 (Performance / SEO / Security).** Named in the tester's README, never created.
- **Re-litigating WB-087 search relevance.** See WB-122.
- **A tax provider integration.** The chosen approach is per-state rates in Medusa.

## Two decisions that shape everything below

Both came from the client on 2026-07-29:

1. **Shipping:** apply the existing free-over-$199 rule to production as-is. Standard
   and Express stay at the same price until real carrier rates exist (WB-123).
2. **Tax:** per-state rates for nexus states, entered into Medusa. No third-party
   provider.

Two values are still outstanding. **Neither blocks implementation** — both are threaded
through configuration so they become a deploy step:

| Value | Mechanism | Consumed by |
|---|---|---|
| Support email + phone | `NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_PHONE` | Wave 2 (Q-04) |
| Nexus states + rates | `state=rate` pairs passed to a script | Wave 1 (Q-06) |

Both surfaces **render nothing rather than a placeholder** when their value is absent.
A contact page showing `support@example.com` is worse than one showing only a form.

---

# Wave 1 · WB-118 — Checkout & money integrity `[CRITICAL]`

The two Criticals live here. A shopper is currently asked to enter card details next to
numbers that contradict each other.

## The exception to severity ordering

Q-01 and Q-02 are the only issues in the batch marked `UNVERIFIED`. I know **where** the
disagreement is; I do not yet know **which side is wrong**. So Wave 1 opens with a
reproduction task, not a fix task:

> **Task 1 (no production code):** drive a real cart → checkout session against a local
> backend. Add a wheel and a tire, set quantity above 1, enter a US address, reach the
> payment step. Capture the raw `StoreCart` payload — every totals field and one full
> line item — into a fixture. Only then write fixes.

Guessing at a money bug is how you ship a second one. The captured payload becomes the
test fixture for everything else in this wave, which is the other reason it comes first.

## Q-01 · Cart shows $0 in the main price field

**Leading hypothesis (strong, not yet proven).**
[`line-item-amounts.ts:29`](../../../storefront/src/lib/util/line-item-amounts.ts)

```ts
const unitPrice = item.unit_price ?? (quantity > 0 ? total / quantity : 0)
```

`??` is nullish-coalescing. A `unit_price` of **`0`** is neither `null` nor `undefined`,
so the fallback never fires and `$0.00` renders — while `LineItemPrice`, which reads
`item.total`, renders correctly right next to it. That is precisely the reported
symptom: *"CART PRICE SHOWING 0 IN MAIN FIELD, SHOWING CORRECT PRICE BELOW THO"*.

Corroborating evidence: checkout's own `LineItemRow`
([`checkout-summary/index.tsx`](../../../storefront/src/modules/checkout/templates/checkout-summary/index.tsx))
computes `perEa = total / item.quantity` unconditionally — it never reads `unit_price` —
and the tester did not report a $0 there.

**Fix.** Treat a contradictory zero the same way as a missing value: when `unit_price`
is falsy but `total` and `quantity` are both positive, derive the unit price. A stored
unit price of `0` alongside a non-zero total is not a legitimate state — it is a
response-shape artifact, and deriving is strictly safer than displaying a lie.

The `lineItemAmounts` docstring's principle (stored amounts are the source of truth,
live variant data may only decorate) is **preserved** — the derivation uses `item.total`,
which is still a stored amount. Nothing starts reading live variant prices.

**Test.** Table-driven cases over `lineItemAmounts`, including the real payload shape
captured in Task 1: `unit_price: 0` + `total: 980` + `quantity: 4` → `245`. Plus a
genuine free line (`total: 0`, `quantity: 1` → `0`) so the fix cannot mask a real zero.

## Q-02 · Checkout summary math does not add up

Two different components render totals, with different labels and different field sets:

| Surface | Component | Rows |
|---|---|---|
| `/cart` | [`cart-totals`](../../../storefront/src/modules/common/components/cart-totals/index.tsx) | Subtotal *(excl. shipping and taxes)*, Discount, Shipping, Taxes, Gift card, Total |
| `/checkout` | `Totals` inside [`checkout-summary`](../../../storefront/src/modules/checkout/templates/checkout-summary/index.tsx) | Subtotal, Discount, Shipping, Tax, TOTAL |

Both render five independent server fields with nothing asserting they reconcile. Two
candidate causes, to be discriminated by Task 1's captured payload:

- **Medusa v2 totals semantics.** `shipping_total` includes shipping tax, and
  `tax_total` also includes shipping tax — so a naive
  `subtotal − discount + shipping + tax` double-counts it. Medusa exposes
  `shipping_subtotal` / `item_total` / `item_subtotal` precisely to disambiguate.
- **A stale or differently-scoped field** on one of the two surfaces.

**Fix.** Whichever it proves to be, the structural fix is the same: a single pure
`cartTotalRows(cart)` helper that both surfaces consume, so `/cart` and `/checkout` can
never again disagree with each other *or* with the charged amount.

**Test.** The helper asserts the invariant

```
sum(displayed rows) === cart.total
```

against the Task-1 fixture and against synthetic carts (discount present/absent,
shipping free/paid, tax zero/non-zero). In development the mismatch surfaces loudly;
in production the total shown is always `cart.total`, which is what Stripe charges — so
a future drift can never charge a number the shopper didn't see.

## Q-07 · Address form accepts a city in the state field

The tester hedged (*"maybe not an issue"*). It is one. The state value is what Q-06's tax
lookup keys on and what a carrier rates against — a free-text state silently produces the
wrong tax and an undeliverable label, with no error at any point.

**Fix.** Constrain state to a validated US state on both shipping and billing address
forms (a select of the 50 states + DC, or a validated 2-letter code), and validate
**before** the payment step rather than at charge time.

**Test.** Rejects `"Chicago"` in the state field; accepts `"IL"` and `"Illinois"`;
country-aware so a non-US address is unaffected.

## Q-08 · Card form does not collect a postal code

AVS postal-code checks are a primary card-fraud control and some issuers decline without
one. Stripe's Payment Element can collect it directly.

**Fix.** Enable postal-code collection on the Stripe element, or pass the billing
address's ZIP into the payment method so AVS has a value to match.

**Verification.** Live Stripe **test mode** only. No real card touches this work.

## Q-05 · Free shipping over $199 · Q-06 · Per-state tax `[ops/config]`

Neither is an application-code bug. Both are configuration that was written, guarded,
and then never run against production.

**Q-05.** [`update-shipping-prices.ts`](../../../backend/src/scripts/update-shipping-prices.ts)
already does exactly the right thing — adds a `$0` price gated on `item_total >= 199`
via `addPrices` (chosen over `updatePriceSets` specifically because it won't delete the
region-scoped price). It is `--confirm-host` guarded and has simply not been executed on
prod. **Action: run it**, then verify a basket above and below $199.

Because the "$199+" copy appears on home, PDP and checkout independently of the rule, this
wave also collapses the storefront's copies into **one exported constant**. The backend
script's `FREE_SHIP_THRESHOLD_USD` cannot literally share it — there is no workspace tool,
each app installs separately — so the two become a documented **lockstep twin**, the same
pattern `normalizeFinish` and `canonicalBoltPatterns` already use across the app boundary.
Unlike those, this twin is a single number, so a shared golden fixture would be heavier
than the risk warrants; a comment on each side naming the other is sufficient.

**Q-06.** [`create-us-tax-region.ts`](../../../backend/src/scripts/create-us-tax-region.ts)
creates a **country-level** US region with no default rate and leaves per-state provinces
to manual admin entry. A single US-level rate makes every state identical — the reported
symptom.

**Action: a new sibling script** that creates province-level tax regions under the US
region from `state=rate` pairs, guarded by `--confirm-host` like every other one-off here,
and idempotent (re-running updates rather than duplicating). The nexus list is the
merchant's determination; the script is the mechanism.

```
npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- \
  --confirm-host=<host> --rates=IL:10.25,CA:7.25
```

**Verification.** Two carts, identical contents, Chicago IL vs Los Angeles CA → different
tax. This is the tester's exact reproduction, so it closes the finding directly.

## Wave 1 gate

- Storefront vitest green, `tsc` at the 2-error baseline, `next build` exit 0.
- Backend `medusa build` exit 0, `jest src/lib` green.
- Live test-mode checkout: totals reconcile, IL ≠ CA tax, $199 threshold behaves,
  postal code collected.

---

# Wave 2 · WB-119 — Support & lead capture `[HIGH]`

## Q-04 · Contact page has no contact channel

Confirmed on the live page: **0 forms, 0 inputs, 0 `mailto:`, 0 `tel:`**. Six surfaces
route here and dead-end:

- [`(checkout)/layout.tsx:36`](../../../storefront/src/app/[countryCode]/(checkout)/layout.tsx)
- [`account/@dashboard/orders/page.tsx:67`](../../../storefront/src/app/[countryCode]/(main)/account/@dashboard/orders/page.tsx)
- [`profile-email/index.tsx:30`](../../../storefront/src/modules/account/components/profile-email/index.tsx)
- [`account-layout.tsx:33`](../../../storefront/src/modules/account/templates/account-layout.tsx)
- [`order/components/help/index.tsx:12`](../../../storefront/src/modules/order/components/help/index.tsx)
- [`tire/fitment.tsx:184`](../../../storefront/src/modules/product-detail/components/tire/fitment.tsx) — see Q-20

The returns policy tells shoppers to *"contact us BEFORE ordering"*
([`policies/content.ts:74`](../../../storefront/src/modules/policies/content.ts)) and
WB-098's out-of-stock CTA says *"special order — contact us to order"*. Every special-order
sale currently has no channel to arrive through.

**Design.** Ship both halves, per the client's decision:

1. **Static channel** — `mailto:` and `tel:` rendered from
   `NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_PHONE`. Each renders only when its
   variable is set. Live the moment the values exist; no email infrastructure needed.
2. **Form** — persists to the database first, emails second.

**Persist-then-notify is the load-bearing decision.** A submission that only sends an
email is lost forever when email is down — and email is down *right now*. Writing the row
first means the lead survives, and the notification becomes a best-effort side effect.
This is the shape the existing `newsletter` module already uses, so it follows an
established pattern rather than inventing one.

**Backend.** A `support-request` module mirroring `newsletter`: one entity
(name, email, phone, subject, message, source, vehicle context, `created_at`), one
migration, one `POST /store/support-request` route. Rate-limited and validated
server-side; the storefront never trusts client validation.

## Q-20 · "Submit your vehicle for a fitment check" leads nowhere

[`tire/fitment.tsx:187`](../../../storefront/src/modules/product-detail/components/tire/fitment.tsx)
links to `/contact` and promises *"we usually confirm within 24 hours"*. The link resolves;
the destination has no form. So this is not a broken link — it is a promise with nothing
behind it.

**Fix.** The same form, reached with vehicle context pre-filled. The link carries the
active vehicle and the product being viewed; the form pre-populates them and records
`source: "fitment-check"` so these leads are distinguishable from general enquiries.

This is the highest-intent lead the site can capture — a shopper with a vehicle we can't
confirm, actively raising their hand. It should not be a generic contact box.

**Note.** Only the tire PDP has this CTA today. The wheel PDP's fitment section has no
equivalent. Adding one is a small, obvious win and is **in scope** for this wave.

## Q-19 · Order confirmation email `[EMAIL-BLOCKED]`

**Not deployable.** No sending domain. WB-094 already made the Resend provider fail-loud
and rebuilt the templates, so there is no known code defect — the tester simply could not
receive mail that was never sent.

**In scope:** prove the path end-to-end with a stubbed transport — `order.placed` →
subscriber → template → provider `send()` — so the day DNS lands, it is a config change
and not a debugging session. Assert the template key matches an `EmailTemplates` enum
entry (the failure mode the root `CLAUDE.md` calls out).

**Out of scope:** actually sending anything.

**Runbook entry:** set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `STOREFRONT_URL`; run one
live roundtrip; watch the logs, because fail-loud means logs are the only signal of a
misconfiguration.

## Wave 2 gate

- Backend: migration applies, `POST /store/support-request` persists, jest green.
- Storefront: form validates, submits, and shows a real success state; the static channel
  renders when env is set and is **absent** when it is not.
- The email path is proven against a stub. No live send is attempted.

---

# Wave 3 · WB-120 — Discovery & availability truth `[HIGH → MEDIUM]`

## Q-03 · Trending tiles show out-of-stock products with no badge

[`trending-data.ts`](../../../storefront/src/modules/search/components/search-drawer/trending-data.ts)
takes `newest.slice(0, 3)` and maps to `{ handle, brand, name, priceCents, finish }`.
`DiscoveryProduct.inStock` exists and is **dropped by the mapper**, so the tile can
neither filter nor badge on it. All three tiles being out of stock, as the tester saw, is
then just luck of the draw.

**Correction carried into this spec:** the `/store` and `/tires` "In stock only" toggles
are **not** broken. Measured on the live site: `/store` 1447 → **1138** with `?in_stock=1`
(Meilisearch ground truth 1137), `/tires` 611 → **399**, zero OUT OF STOCK badges on either
filtered page. Only the drawer lacks a gate.

**Fix.** Prefer in-stock products when choosing the three tiles, and carry `inStock`
through to the tile so anything still shown out of stock is badged — the grid cards
already do exactly this, so it is consistency, not new UX.

**Deliberately not doing:** hard-filtering to in-stock only. If fewer than three in-stock
products exist, showing three badged tiles beats showing one. This also keeps the change
compatible with WB-110 (special-order products currently blanket-read OUT OF STOCK), which
remains tracked separately.

## Q-10 / Q-11 · Filters that read as empty

**Not empty — collapsed.** Both rails omit sections from the accordion's `defaultValue`,
and Radix unmounts collapsed content:

| Rail | Line | `defaultValue` | Collapsed, therefore "empty" |
|---|---|---|---|
| `/store` | [`filter-sections.tsx:279`](../../../storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx) | `["brand","diameter","finish"]` | **Bolt pattern**, Price |
| `/tires` | [`tire-discovery/…/filter-sections.tsx:279`](../../../storefront/src/modules/tire-discovery/components/filter-rail/filter-sections.tsx) | `["brand","rim-diameter","tire-type"]` | **Size**, **Speed rating**, **Load rating**, Price |

The collapsed sets match the tester's two findings exactly. The data is complete — the
page payload carries all 46 canonical bolt patterns, 500 tire sizes, 16 speed ratings and
80 load indexes.

**Fix, in two parts.** Opening every section by default would make the tire rail very
long, so:

1. Open **Bolt pattern** on `/store` and **Size** on `/tires` by default — these are the
   primary filters for their surface (bolt pattern is also the fitment join key).
2. Show the **available-value count on every collapsed trigger** (e.g. `Speed rating 16`).
   This is the actual fix for the reported bug: a collapsed section can then never again
   be mistaken for an empty one, including for sections we choose to leave closed.

**Follow-up to confirm while in here.** `tire_sizes` returns exactly **500** distinct
values, which is the index's `maxValuesPerFacet: 500` ceiling — so the size list may be
silently truncated. Confirm; if truncated, either raise the ceiling or make the truncation
visible. A silently short size list is a real miss on a tire store.

## Q-12 · Style counts over-claim

**Root cause confirmed by arithmetic.**
[`style-map.ts:49`](../../../storefront/src/modules/home/components/shop-by-style/style-map.ts):

```ts
const count = def.values.reduce((sum, v) => sum + (dist[v] ?? 0), 0)
```

`diameters`, `finishes` and `brands` are **multi-valued** on the indexed document, so a
wheel offered in both 18" and 20" lands in both facet buckets and is counted twice. The
listing correctly returns the *distinct* set matching `diameters IN [18,19,20]`.

Measured against the live index — every number reconciles:

| Style | Preset | Summed buckets | Tile claims | Listing shows |
|---|---|---|---|---|
| Street | 18 + 19 + 20 | 487 + 187 + 876 = **1550** | 1550 | 1076 |
| Truck & Dually | 22 + 24 + 26 | 449 + 203 + 81 = **733** | 733 | 490 |
| Drag | 15 + 17 | 153 + 500 = **653** | 653 | 593 |
| Luxury | silver (1 value) | **602** | 602 | 602 ✓ |
| Off-road | 1 brand | **115** | 115 | 115 ✓ |
| UTV | 1 brand | **7** | 7 | 7 ✓ |

The three that match are exactly the three single-value presets, where summing and
distinct-counting coincide. That is conclusive.

**Fix.** The count must be a real distinct count — the `estimatedTotalHits` of the same
filter the listing applies — not a sum of buckets. Since `styleTiles` runs on both the
homepage section and `/styles`, one fix corrects both surfaces.

**Cost note.** This turns 6 arithmetic operations into 6 Meilisearch counts. They batch
into the existing `multiSearch` and sit behind the established `unstable_cache` (tag
`discovery`, 60s) that WB-021 introduced, so the added cost is one batched round trip per
cache period, not per request.

**Guard.** A test asserting that a preset with overlapping values reports the distinct
count, not the sum — the exact regression, pinned.

## Q-13 · Brand count mismatch

Reported as 25 on the homepage vs 27 in the store filter for *American Racing Forged*.
Meilisearch says **25** for `product_type = "wheel"`, so the 27 is the outlier — most
likely a count that isn't scoped to wheels, or includes drafted docs.

Unlike Q-12, this is **not yet root-caused**: `brand` is single-valued per document, so
the double-counting explanation does not apply. First task is to locate the surface
producing 27; the fix is then one shared, identically-scoped brand-count helper.

## Q-15 · Price range slider

Already a tracked TODO in the code and in `storefront/CLAUDE.md`:

> `TODO(integration): replace the two TextInputs with a <Slider value={[min,max]}/> …
> once a real min/max range comes from Meilisearch's price aggregation.`

**This is not a pure UI swap** — a slider needs real bounds, which means surfacing a
price min/max from the index. Two pieces: the aggregation, then the shadcn `Slider`
(`npx shadcn@2.1.8 add slider`, subject to the documented pnpm-on-PATH workaround).

Kept in this wave because it touches the same rail as Q-10/Q-11 and the tester raised it
as felt quality. If it proves larger than expected once the aggregation is scoped, it
splits out rather than delaying the wave.

## Wave 3 gate

- Storefront vitest green (new cases for the distinct style count, the trending stock
  gate, and collapsed-trigger counts), `tsc` at the 2-error baseline.
- Live re-measure: every style tile count equals its listing count.

---

# Wave 4 · WB-121 — Catalog data honesty & routing `[MEDIUM → LOW]`

## Q-16 · "Center bore 999 mm"

**45 wheel products** in the live index carry `center_bores: [999]` — Asanti Forged 832,
862, 868 among them. `999` is a WheelPros sentinel for *bore-to-order / custom*, which is
genuinely what a forged wheel is. It is real feed data being rendered literally.

[`spec-rows.ts:18`](../../../storefront/src/modules/product-detail/components/specs/spec-rows.ts):

```ts
if (specs.centerBoreMm > 0) rows.push({ label: "Center bore", value: `${specs.centerBoreMm} mm` })
```

WB-056 added the `> 0` guard to hide zero and null. `999` sails straight through it —
and is *worse* than a hidden row, because it is a plausible-looking number.

**Fix — decided: storefront render layer, not ingest.** Normalising `999` at ingest
(`backend/.../vendor-sync/`) is the tidier long-term answer, but it would require a full
re-import plus a Meilisearch reconcile to correct 45 products, which is disproportionate
to a cosmetic spec row. The sentinel becomes visible in exactly two render sites, so it
is fixed there via one shared pure helper:

- [`spec-rows.ts:18`](../../../storefront/src/modules/product-detail/components/specs/spec-rows.ts)
- the per-variant readout at [`hero/index.tsx:286`](../../../storefront/src/modules/product-detail/components/hero/index.tsx)

Render the honest **"Custom / bore-to-order"** rather than hiding the row — for a forged
wheel that is real information, not an absence.

**Consequence of this choice:** Wave 4 needs **no reconcile and no re-import**, and ships
as a plain storefront deploy. Ingest-side normalisation is recorded as a follow-up, to be
folded into the next full re-import rather than triggering one.

**Sweep, as the tester asked.** They called this *"likely systemic"* and asked for an
audit of `999` / `0` / `null` across specs. Enumerate sentinel values across the indexed
numeric spec fields and handle what turns up in the same pass.

**One thing to verify, not assume.** [`fit-view.ts:51`](../../../storefront/src/modules/product-detail/data/fit-view.ts)
gates on `boreClears(o.centerBoreMm, vehicle.hubBoreMm)`. A `999` bore clears every hub,
so the sentinel currently reads as *"fits everything"*. For a bore-to-order wheel that is
arguably correct — but it is correct **by accident**, and the fix must not silently flip
it. Whatever the new representation is, confirm the fitment verdict for these 45 products
before and after; unchanged is the expected result.

## Q-17 · Uppercase paths 404

Measured: `/us/store/` → `308` → `/us/store` ✓, but `/US/STORE` → `307` → `/us/STORE` →
**`404`**. [`middleware.ts:108`](../../../storefront/src/middleware.ts) lowercases
`pathname.split("/")[1]` — the country code — and leaves the rest of the path's case
untouched, so it misses every route.

**Fix.** Lowercase the whole pathname in the same redirect that already lowercases the
country code, as a `308`.

**Constraints.** The middleware is deliberately fail-open (WB-081) and has three
documented edge-case fixes from WB-096 X8, including an infinite-self-redirect guard.
This change must compose with them, not around them: never redirect to the current URL,
and leave `/robots.txt` and `/sitemap.xml` excluded (WB-082).

**Test.** `/US/STORE` → `/us/store`; already-lowercase paths are untouched (no redirect
loop); query strings survive.

## Wave 4 gate

- Backend jest green; a PDP for one of the 45 affected products shows the honest bore row.
- Fitment verdict for those 45 products is unchanged from before the fix.
- `/US/STORE` resolves; `/us/store` still does not redirect.

---

# Deferred, tracked

## WB-122 · Search relevance `[blocked on repro]`

The tester wrote *"search bar needs to be improved"* with no failing query. WB-087 already
added `search_text`, synonyms and model-name titles. Without a concrete failure this is
not actionable, and guessing risks regressing that work. **Unblocks on:** two or three
searches with the expected result and the actual result.

## WB-123 · Express shipping differentiation `[blocked on carrier rates]`

Standard and Express are the same price. Wave 1 applies the $199 free-shipping rule, so
the advertised promise stops being false either way — but offering a paid upgrade that
costs the same as the free option remains a real problem. **Unblocks on:** real prices and
transit times per method.

---

# Cross-cutting

## Testing

Every wave follows the repo's existing TDD discipline: a failing test that reproduces the
defect, then the fix. Three findings get a **golden/invariant** test rather than an
example test, because each is a class of bug rather than a single instance:

| Invariant | Guards |
|---|---|
| Displayed total rows sum to `cart.total` | Q-02, and any future totals drift |
| A style tile's count equals its listing's count | Q-12, and any future preset |
| A collapsed facet section still reports its value count | Q-10/Q-11 recurrence |

## Configuration added

| Variable | App | Behaviour when unset |
|---|---|---|
| `NEXT_PUBLIC_SUPPORT_EMAIL` | storefront | Email channel not rendered |
| `NEXT_PUBLIC_SUPPORT_PHONE` | storefront | Phone channel not rendered |

Both go into `.env.local.template`. Neither is added to `check-env-variables.js`'s
hard-required list — an unset support phone must not fail the build.

## Ops steps (not code — recorded in the go-live runbook)

1. **Q-05** — run `update-shipping-prices.ts` against prod with `--confirm-host`.
2. **Q-06** — run the new state-tax script with the confirmed nexus list.
3. **Q-19** — set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `STOREFRONT_URL`; one live
   roundtrip.
4. Set `NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_PHONE`, then **rebuild the
   storefront** — `NEXT_PUBLIC_*` values are baked in at build time.

## Deploy ordering

Waves 1, 3 and 4 are independently deployable. **Wave 2 is not**: its backend migration
and `POST /store/support-request` route must be live before the storefront form ships, or
every submission 404s. Backend first, then storefront.

**No wave requires a Meilisearch reconcile or a re-import.** This is a deliberate
constraint, not a coincidence — Wave 4's sentinel fix was placed at the render layer
specifically to keep it true (see Q-16). If any wave's plan later proposes moving logic
into the transformer, that plan must add the reconcile step explicitly and say so in its
gate.

## Documentation

Per the repo's documentation workflow: flip each `WB-118`…`WB-123` status as it lands,
update `docs/STATUS.md`'s "Last verified" date and affected pillar rows, move this spec
and its plan from `docs/in-progress/` to `docs/done/` when the epic merges, and run
`/doc-review` before committing doc-affecting changes.
