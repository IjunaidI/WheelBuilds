# WB-092 · Cart & checkout correctness — design

> G11 Wave 3. Findings **C1–C14** ([audit §C](../../future/plans/2026-07-13-ux-completeness-audit.md)).
> Re-verified against current `main` (`a701fb3`) 2026-07-15 — evidence inline. Storefront (+ one backend read for the stock preflight).
> **C6 order components are SHARED with WB-093 — WB-092 owns the receipt-bug fixes; WB-093 mounts/extends.**

## Problem
Cart/mini-cart line prices read the LIVE variant price (not the charged amount), so they drift after a reprice and render a bare `"NaN"` + `/products/undefined` for a discontinued product; there's no stock re-check before Stripe captures (`capture:true`); a backend outage shows "Nothing in your cart"; the checkout chrome carries a fake phone + unlinked policies + unwired wallet badges; the confirmation page fabricates shipping/ETA/tracking; the receipt mangles `$10.00`→`$10,00`; the chosen finish is invisible on the cart; and several mutations still throw (prod-redacted) instead of returning errors.

## Decisions (defaults; the consequential one flagged)
- **C2 stock preflight (the big one):** a new server action `checkStockAvailability(cart)` in `lib/data/cart.ts` re-fetches live variant inventory (reuse `getProductsById` already imported + the `maxSelectableQty` logic in `max-qty.ts`) and returns a B2-shaped `{ error?: string }` naming the first insufficient item. Gate it at **two** points: the Review step's mount (show an OOS banner/badge before the button) AND the very start of `PaymentButton.handlePayment` — if it fails, show the error and **never call `stripe.confirmCardPayment`**. Accepts one extra inventory fetch per attempt (Medusa's `cart.complete()` re-reserves anyway).
- **C6 ownership:** WB-092 fixes the `shipping-details`/`payment-details` receipt bugs (`.replace` mangle, unguarded `[0]`, `paymentInfoMap[...]` crash). WB-093 mounts `PaymentDetails` + adds fulfillment/tracking (different concern) — sequential on the wave branch, no line collision.

## Design (storefront + one backend read)
1. **Stored-amount pricing (C1).** `LineItemPrice`/`LineItemUnitPrice` render `item.total`/`item.unit_price` (the charged amounts — `checkout-summary` already does), NOT `getPricesForVariant(item.variant)`. A missing/unpriced variant renders the stored title + amounts (never `NaN`); cart/mini-cart links guard `item.variant?.product?.handle` (no `/products/undefined`).
2. **Stock preflight (C2).** As above — `checkStockAvailability` + the two gates; cart lines get an OOS/insufficient badge when live qty < line qty (display-only; the WB-034 cap stays).
3. **Failure states (C3, C8).** `retrieveCart` distinguishes network/5xx (throw → the existing `(main)`/`(checkout)` error boundary) from 404/no-cart (null → EmptyCart); `CheckoutForm` renders a "couldn't load delivery/payment options — retry" block instead of `null`; `retrieveOrder` catches → null so `notFound()` works (currently dead code — it always throws), and the confirmed-page copy reassures a just-charged customer ("your order may still have gone through — check your email") rather than a generic "something broke".
4. **Action error contract (C9).** Extend the B2 `{ error? }` return to `updateLineItem`, `deleteLineItem`, `applyPromotions` (reuse `errText`); callers drop `.catch` for `res?.error` checks; `DeleteButton` gains an error slot (sonner toast — it's reused in the full cart + mini-cart with different layout space).
5. **Checkout chrome trust (C4).** Remove the fake `(855) 555-RIDE` → "Need help? Contact us" → `/contact`; link the footer TERMS/PRIVACY/REFUND labels + the review-consent policy names → `/terms` `/privacy` `/returns`; drop the APPLE/GPAY badges (wallets unwired).
6. **Honest confirmation (C5, C10).** Shipping line from `order.shipping_methods[0]` (name + real paid amount); ETA anchored to `order.created_at`; tracking copy → "we'll email tracking" (no SMS); the "email sent" line conditional/softened; the fitment card requires `every` fitting line (not `.some()`) + refund copy aligned with the actual conditional `/returns` policy (drop "refund every penny").
7. **Receipt correctness (C6).** Delete the `.replace(/,/g,"").replace(/\./g,",")` decimal mangle in `shipping-details`; guard the `[0]` accesses in `shipping-details`/`payment-details`; `paymentInfoMap[provider_id]?.` fallback.
8. **Line identity (C7).** Cart/mini-cart render `variant.options` values (checkout-summary parity) and prefer `variant.metadata.image_url` (the per-finish image) for the thumbnail, so a Bronze buyer doesn't see a Black wheel.
9. **Flow guards (C11, C12).** Server-side furthest-allowed-step clamp in `checkout/page.tsx` (from cart state); sliding cart-cookie renewal on cart reads (not just creation).
10. **Nits (C13, C14).** Shipping-option descriptions + a zero-options empty state; optional-chaining fixes (`cart?.shipping_methods?.`); `await` the Next-15 `params` on the confirmed page; the "You purchase was successful" metadata typo.

## Verify
Vitest: line-price source (stored, no NaN on missing variant); `checkStockAvailability` (insufficient → named error); the B2 return shapes; step-clamp; `.some`→`.every` fit card; `lit`-style receipt formatting. Live (test Stripe): OOS-between-add-and-pay blocks BEFORE the charge with a named item; discontinue-a-carted-product renders stored title/price (not NaN); a backend blip shows "temporarily unavailable — retry", not "empty cart".

## Deploy
Storefront rebuild only.

## Out of scope
Real wallets (APPLE/GPAY); gift cards (WB-054); guest order lookup (WB-097); the account-order fulfillment/tracking render + PaymentDetails mount (WB-093 owns those).
