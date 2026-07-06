# Checkout & money honesty (G9 cluster 2) — Design

> Status: **done** — implemented + merged to `main` 2026-07-06. Session = epic **G9** (audit remediation), cluster **checkout-money-honesty**.
> Backlog id: **WB-071** (under the WB-069 umbrella).
> Remediates **9 PENDING findings** (re-verified against current `main` 2026-07-06 — all HOLD): F-A…F-I below.
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-storefront.md](../../future/plans/2026-07-06-audit-findings-storefront.md) (#4,5,8,14,15,16,17,21) + [audit-findings-vendor-sync.md](../../future/plans/2026-07-06-audit-findings-vendor-sync.md) (#10 Manual Payment)

## 1. Context

The customer-facing purchase journey (Home → Discovery → PDP → Cart → Checkout → Order) is live. The
2026-07-06 audit found a family of **money-honesty** defects: **what the customer sees and agrees to does
not equal what the system does with their money** — an unpaid-order path in production, a checkout total
that displays a different number than it charges, a card-authorized-but-no-order dead end, marketing
promises with no backing rule, and region-price mismatches.

All nine findings were single-reviewer PENDING claims; a re-verification pass against current `main`
(2026-07-06) confirmed **all nine still hold** (checkout/payment code was untouched by the mid-audit G1
and tire-fitment merges). Two findings (F-H, F-I) are broader in the current code than the original
write-ups.

The remediation principle (inherited from the G9 theme): **every price, total, payment option, and
shipping/region promise the customer sees must equal what actually happens — and a failure after the
card is authorized must be loud, not a silent dead end.**

### The findings this cluster closes

| # | Sev | One-line | Area |
|---|---|---|---|
| F-A | HIGH | `pp_system_default` "Manual Payment" selectable in prod → order placed with no charge | backend region + storefront checkout |
| F-C | HIGH | `placeOrder` drops the completion error (HTTP 200) after card auth → silent dead end | storefront cart data |
| F-B | HIGH | Checkout TOTAL `Math.round`s then pads fake `.00` → shows ≠ charge; rows don't sum | storefront checkout |
| F-E | MED | Switching payment method never re-initiates the session → charged by the OLD provider | storefront checkout |
| F-D | MED | PDP/related/featured price the DEFAULT region; cart uses the route region | storefront + region config |
| F-H | MED | "Free shipping $199+" promised on 3 surfaces; backend charges flat $10, no rule | backend shipping + storefront copy |
| F-F | MED | Checkout hardcodes `address_2:""` + no unit field → saved apartment number lost | storefront checkout |
| F-G | MED | Promo-code error surface is a dead wire → invalid codes fail silently | storefront checkout |
| F-I | LOW | PDP/card/tile prices `Math.round(cents/100)` → quoted ≠ charged (~10 files) | storefront (PDP/discovery/home) |

### Current-state facts (grounded, re-verified 2026-07-06)

| Fact | Evidence |
|---|---|
| US region created with `payment_providers: ["pp_system_default"]`; nothing removes it when Stripe is on. | [bootstrap.ts:32](../../../backend/src/modules/vendor-sync/pipeline/bootstrap.ts#L32), [seed.ts:120](../../../backend/src/scripts/seed.ts#L120) |
| Storefront maps `pp_system_default` → "Manual Payment"; the "testing only" badge is dev-gated but the OPTION is not. | [constants.tsx:29-32](../../../storefront/src/lib/constants.tsx#L29), [payment-container/index.tsx:24-57](../../../storefront/src/modules/checkout/components/payment-container/index.tsx#L24) |
| `ManualTestPaymentButton` calls `placeOrder()` directly (no charge). | [payment-button/index.tsx:262-299](../../../storefront/src/modules/checkout/components/payment-button/index.tsx#L262) |
| `placeOrder` only redirects on `type === "order"`, else `return cartRes.cart` (drops `cartRes.error`, HTTP 200). All 3 `onPaymentCompleted` `.catch` handlers are structurally dead for this case. | [cart.ts:309-331](../../../storefront/src/lib/data/cart.ts#L309), [payment-button/index.tsx:97-105](../../../storefront/src/modules/checkout/components/payment-button/index.tsx#L97) |
| Checkout TOTAL: `Math.round(total).toLocaleString(undefined,{minimumFractionDigits:2})`; LineItem + Affirm same; Subtotal/Shipping/Tax use exact `convertToLocale`. | [checkout-summary/index.tsx:131,181,188](../../../storefront/src/modules/checkout/templates/checkout-summary/index.tsx#L181), [money.ts:11-26](../../../storefront/src/lib/util/money.ts#L11) |
| `activeSession` = pending session; `initiatePaymentSession` only fires `if (!activeSession)`; `PaymentButton` dispatches on `payment_sessions?.[0]` (unfiltered). | [payment/index.tsx:25-27,91](../../../storefront/src/modules/checkout/components/payment/index.tsx#L85), [payment-button/index.tsx:38](../../../storefront/src/modules/checkout/components/payment-button/index.tsx#L38) |
| PDP/related/featured call `getRegion(DEFAULT_COUNTRY)`; PurchasePanel add-to-cart uses `useParams().countryCode`. Two live regions (US/usd, Europe/eur); catalog is USD-only. | [get-product.ts:100,141](../../../storefront/src/modules/product-detail/data/get-product.ts#L100), [get-featured.ts:64](../../../storefront/src/modules/home/data/get-featured.ts#L64), [purchase-panel.tsx:59,73](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx#L59) |
| Both seeded shipping options are `price_type:"flat"`, `amount:10`, no cart-total rule. Copy: PDP `FREE_SHIP_THRESHOLD_USD=199`; home "Free shipping $199+"; checkout "Free 2–3 day shipping" (unconditional). | [seed.ts:256-333](../../../backend/src/scripts/seed.ts#L256), [pdp-config.ts:24](../../../storefront/src/modules/product-detail/data/pdp-config.ts#L24), [merchandising.ts:10,25](../../../storefront/src/modules/home/data/merchandising.ts#L10), [trust-strip/index.tsx:6](../../../storefront/src/modules/checkout/components/trust-strip/index.tsx#L6) |
| `setAddresses` hardcodes `address_2:""` (shipping + billing); the shipping form has no unit field; account form DOES collect it. | [cart.ts:272,291](../../../storefront/src/lib/data/cart.ts#L272), [shipping-address/index.tsx:37-53,102-174](../../../storefront/src/modules/checkout/components/shipping-address/index.tsx#L102), [add-address.tsx:90-95](../../../storefront/src/modules/account/components/address-card/add-address.tsx#L90) |
| Promo: `useFormState(submitPromotionForm)` result unused; form action is a separate `addPromotionCode` closure; `<ErrorMessage error={message}>` permanently null; Medusa `updateCart` no-ops unknown codes. | [discount-code/index.tsx:30-48,84](../../../storefront/src/modules/checkout/components/discount-code/index.tsx#L43) |
| `formatUsd = $${Math.round(cents/100)...}` in ~10 files (PDP wheel+tire, discovery+tire cards, active-chips, home featured). | [purchase-panel.tsx:31](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx#L31) + grep |
| Middleware routes by Vercel IP header → default region → first backend region (an EU IP can land on `/de`). | [storefront/src/middleware.ts](../../../storefront/src/middleware.ts) |
| Storefront gates: `next build` ignores TS/eslint errors; run `tsc --noEmit` (14 pre-existing baseline) + `vitest` separately. | [storefront/CLAUDE.md](../../../storefront/CLAUDE.md) |

## 2. Goals / non-goals

**Goals**
- No customer can complete an order without paying (F-A).
- A completion failure after card authorization is shown to the customer, not a silent stopped spinner (F-C).
- The number on the "Place order" button and the checkout TOTAL equal the amount charged, on every surface (F-B, F-I).
- The payment method the review shows equals the one that charges (F-E).
- The shipping and price shown equal what the customer is charged; the "free shipping $199+" promise is backed by a real rule (F-H, F-D).
- Saved apartment/unit numbers reach the order (F-F); invalid promo codes give feedback (F-G).

**Non-goals (out of scope)**
- Real multi-region / i18n (EUR catalog prices, translations) — the store is treated as US-only (user decision). We fix the consistency bug and lock the region, nothing more.
- Pricing/markup rules (WB-024), placeholder shipping-option names/reply-to (WB-031) — separate items.
- The other four G9 clusters.
- No redesign of the checkout visual layer — these are behavior/copy fixes inside the existing (legacy Medusa-UI) checkout.

## 3. Chosen approach

Five root-cause groups. Storefront-heavy; two backend pieces (shipping rule, region strip) plus two
prod-only data scripts I will NOT run. Pure formatting/threshold logic is extracted for vitest.

Decisions locked with the user (2026-07-06): **hide Manual Payment + region-strip script**, **make free
shipping real ($199+)**, **lock US-only + consistent pricing**. F-H is attempted as the real rule; if the
Medusa v2 price-rule API can't express it cleanly, STOP and confirm before falling back to copy-removal.

### Group 1 — Payment can't silently go wrong *(F-A, F-C, F-E)*

**F-A.** The customer checkout must not offer `pp_system_default` in production.
- Storefront: filter `pp_system_default` out of `availablePaymentMethods` before it reaches the `Payment`
  radio group, gated so it stays available when `process.env.NODE_ENV !== "production"` (dev/test can still
  exercise it). Locate the single fetch point that supplies `availablePaymentMethods` to the checkout
  payment step and filter there (one seam, not per-component).
- Backend: a guarded, idempotent `src/scripts/strip-manual-payment.ts` (medusa exec) that removes
  `pp_system_default` from the US region's `payment_providers` when Stripe is configured, refusing to run
  without `-- --confirm-host=<DATABASE_URL host>` (matches the repo's destructive-script convention). Ops
  runs it against prod; the code fix alone closes the customer path.
- Also stop NEW deploys from re-adding it: `ensureUsRegion` / seed should only include `pp_system_default`
  when Stripe is NOT configured (so a Stripe-enabled deploy never wires the manual provider onto the region).

**F-C.** `placeOrder` throws on a non-order completion result:
```
if (cartRes?.type === "order") { ...redirect... }
throw new Error(cartRes?.error?.message || "We couldn't complete your order. Your card was not charged, or the charge will be reversed. Please try again.")
```
The three `onPaymentCompleted` handlers already `.catch(e => setErrorMessage(e.message))`, so the message
now surfaces and the spinner-stops-silently dead end is gone. (Copy is careful: it does not promise a
specific charge state we can't guarantee — it tells them the order didn't complete and to retry.)

**F-E.** In `payment/index.tsx handleSubmit`, re-initiate when the provider changed:
`if (!activeSession || activeSession.provider_id !== selectedPaymentMethod) initiatePaymentSession(...)`.
And `PaymentButton` selects the session by `status === "pending"` (matching `payment/index.tsx`'s
`activeSession`) rather than `payment_sessions[0]`, so "selected" and "charged" can't diverge.

### Group 2 — Prices tell the truth *(F-B, F-I)*

Standardize on a single money formatter that formats **exact cents** (wraps the existing
`convertToLocale`, no `Math.round`). Replace every `Math.round(total)` / `Math.round(cents/100)` money
display with it:
- Checkout: the TOTAL, LineItem, and Affirm lines in `checkout-summary/index.tsx` (so the rows sum to the
  total, and cart == checkout).
- PDP + tile surfaces: the ~10 `formatUsd = $${Math.round(cents/100)...}` sites (PDP wheel + tire panels,
  discovery + tire cards, active-chips, home featured). One consistent helper; displayed == charged.

Non-money integer displays (counts, quantities) are untouched — only currency formatting changes.

### Group 3 — Shipping promise is real *(F-H)*

Add a **conditional shipping price**: `0` when the cart item subtotal ≥ `19900` cents, else `1000`.
- Fresh installs: update `seed.ts`'s shipping-option creation to attach the rule.
- Live data: an idempotent `src/scripts/update-shipping-prices.ts` (medusa exec, `--confirm-host`-guarded)
  that adds/updates the conditional price on the existing options.
- Storefront: already renders "FREE" when `shipping_total === 0`; also align the copy so all three surfaces
  say the SAME threshold ("Free shipping on orders $199+"), including the currently-unconditional checkout
  trust-strip line.
- **Implementation risk:** the exact Medusa v2 shipping price-rule shape (attribute name for cart subtotal,
  operator) must be confirmed against the installed 2.13.6 pricing module before coding. If it cannot be
  expressed as a calculated shipping price, STOP and confirm the fallback (copy-removal → honest flat $10)
  with the user rather than shipping a half-rule.

### Group 4 — One region, consistently priced *(F-D, F-F)*

**F-D.** Treat the store as US-only (user decision):
- PDP/related/featured resolve the **route** region (thread `countryCode` into `getProductDetail`,
  `getRelatedProducts`, `getFeaturedProducts`), consistent with the cart. For a US shopper this is
  behavior-neutral (route == default == US) but closes the display-vs-charge seam.
- Middleware stops IP-routing to a non-default region (drop/clamp the Vercel-IP branch so resolution is
  `NEXT_PUBLIC_DEFAULT_REGION` → US), so no shopper lands on `/de` against a USD-only catalog.
- Document the single-region assumption in `storefront/CLAUDE.md` (routing section).

**F-F.** Carry `address_2` through checkout:
- Add an "Apartment, suite, etc. (optional)" input to the shipping form (and billing), matching the account
  form's field.
- `setFormAddress` copies `address_2` when hydrating from a saved address.
- `setAddresses` reads `formData.get("shipping_address.address_2")` / billing instead of `""`.

### Group 5 — Promo feedback works *(F-G)*

Rewire `discount-code/index.tsx` so an invalid/expired code shows an inline error. Because Medusa's
`updateCart({promo_codes})` silently no-ops unknown codes, the handler **diffs `cart.promotions` before vs
after** applying: if the requested code is absent afterward, surface "Code not applied" via the existing
`<ErrorMessage>` (wire it to real state — either the `useFormState` return or local error state — instead
of the dead `message`). A valid code still applies + clears the input as today.

## 4. Interfaces & isolation

Pure, vitest-tested (no network):
- `formatUsd(cents: number): string` (or the chosen shared money formatter) — exact-cent, no rounding (F-B/F-I).
- The free-ship threshold display predicate (if any pure logic is extracted) (F-H).
- A `filterCustomerPaymentMethods(methods, { isProduction }): method[]` helper for F-A (pure; testable).
- A promo-diff helper `promoApplied(before, after, code): boolean` for F-G (pure).

I/O / component (tsc + build + review):
- `placeOrder` (F-C), `payment/index.tsx` + `payment-button/index.tsx` (F-A/F-E), `checkout-summary` +
  the ~10 rounding sites (F-B/F-I), `get-product.ts`/`get-featured.ts`/`middleware.ts` (F-D),
  `setAddresses` + shipping/billing forms (F-F), `discount-code` (F-G).
- Backend: `seed.ts` + `bootstrap.ts` (F-A/F-H), `strip-manual-payment.ts` + `update-shipping-prices.ts` (scripts).

## 5. Testing

- **Storefront `vitest`** — new cases for the exact-cent formatter (a `.99` value formats `.99`, not `.00`;
  a whole value formats `.00`), `filterCustomerPaymentMethods` (drops `pp_system_default` in prod, keeps
  in dev, keeps Stripe), and the promo-diff helper. No regressions in the existing suite (~200).
- **Storefront** `npx tsc --noEmit` (14-baseline, no new) + `pnpm build:next` (bundles clean).
- **Backend** `medusa build` exit 0 (seed/bootstrap/scripts compile) + `pnpm test:sync` still green.
- **Live end-to-end NOT run against prod.** The two prod scripts are delivered guarded; a Stripe test-mode
  checkout smoke (Manual gone, total exact, free-ship over $199) is recommended on staging.

## 6. Deploy notes

- **F-A:** the code fix hides Manual Payment for customers immediately on deploy; ops must ALSO run
  `strip-manual-payment.ts` against prod to remove it from the existing region row (a code change can't
  retroactively edit live data). Check no cart is mid-checkout on a manual session first.
- **F-H:** run `update-shipping-prices.ts` against prod after deploy; until then the copy says $199+ but the
  charge stays $10 (no worse than today). Storefront copy + backend rule should land together. **The rule is
  verified by source-reading only (F-H research) — dry-run it against a disposable/dev DB before the real
  `--confirm-host=<prod>` invocation** (validate the `addPrices` rule shape end-to-end).
- **F-D:** middleware US-lock changes routing — existing `/de` bookmarks resolve to `/us`. No `NEXT_PUBLIC_*`
  rebuild beyond the normal storefront deploy.
- **No migration.** No schema change. `NEXT_PUBLIC_*` flags unchanged.
- **Staging smoke before prod (whole-branch review):** (a) $150 cart → $10 shipping / $250 cart → $0 shipping
  (validates the `item_total`-in-dollars unit + `addPrices` matching); (b) `NODE_ENV=production` checkout
  offers no Manual Payment; (c) force a post-auth completion failure and confirm an error surfaces.
- **`build:next` is NOT part of the automated gate here** — it needs a live backend on :9000 for SSG (data
  fetch), unavailable in the dev sandbox. Storefront correctness rode on `tsc --noEmit` + `vitest`; run
  `build:next`/bundle verification on staging/CI where the backend is up.

## 7. Risks & trade-offs

- **F-H price-rule uncertainty** is the main risk — gated by the "confirm before fallback" rule in §3.
- **F-A region strip is a live-data action** the code can't perform; the customer path is closed by the code
  regardless, so the residual risk (provider present on the region but unreachable via storefront) is low.
  **Belt-and-suspenders (whole-branch review):** a cart carrying a `pp_system_default` *pending session*
  created before deploy could otherwise still reach the Manual place-order button — so the button is also
  neutralized in production in code (`payment-button` renders a disabled fallback for the manual case when
  `NODE_ENV==="production"`), not just filtered from new selection.
- **F-C copy in production (whole-branch review):** `placeOrder` is a Server Action, so Next.js redacts a
  thrown error's message to a generic string + digest on the client in production. The failure still surfaces
  loudly (spinner stops, an error renders — the finding's core goal) but the specific reassurance wording may
  show generic. A returned-value pattern (instead of throw) would preserve exact copy — a follow-up, not a
  blocker.
- **F-D US-lock** forecloses EU shoppers deliberately (they'd see a broken USD-only catalog otherwise). Real
  multi-region is a separate project; the assumption is now documented, not implicit.
- **Rounding sweep breadth** (~10 files): the risk is missing a surface. The plan enumerates every site from
  the verifier's grep so none is left rounding while its neighbor is exact.
