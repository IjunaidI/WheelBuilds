# WB-092 Cart & Checkout Correctness — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront (+1 backend read). Spec: [../specs/2026-07-15-wb-092-cart-checkout-design.md](../specs/2026-07-15-wb-092-cart-checkout-design.md).

**Global constraints:** The **B2 pattern** is load-bearing — Server Actions RETURN `{ error?: string }` (built via the local `errText()` in `cart.ts`), never throw, because Next.js redacts thrown Server-Action messages in prod. Money: `item.total`/`item.unit_price` are the CHARGED amounts. Storefront tests `npx vitest run <path>` (import `{describe,it,expect}`; 5-error tsc baseline). **C6 order components: WB-092 owns the receipt-bug fixes** (WB-093 later mounts/extends — don't do its work). Branch `feat/g11-wave3-transact-account`.

---

### Task 1: C1 — stored-amount pricing (no NaN, no /products/undefined)
**Files:** `modules/common/components/line-item-price/index.tsx` (~14-23), `line-item-unit-price/index.tsx` (~14-21), `modules/cart/components/item/index.tsx` (~28,51-52), `modules/layout/components/cart-dropdown/index.tsx` (~142,157). Reference: `modules/checkout/templates/checkout-summary/index.tsx:77-78` already uses `item.total ?? 0` correctly. Test: a pure price-source helper.
- [ ] Failing test: a line whose `variant` is missing/unpriced renders the STORED amount (not `NaN`); the product link is omitted (not `/products/undefined`) when `variant?.product?.handle` is absent.
- [ ] RED → implement: `LineItemPrice`/`LineItemUnitPrice` render `item.total`/`item.unit_price` (drop `getPricesForVariant(item.variant)` as the price source; live variant data may still decorate e.g. an original/strikethrough only when present). Cart + mini-cart guard `handle` — render the title as plain text when absent.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-092): cart/mini-cart price from the stored charged amount (C1)`.

---

### Task 2: C2 — stock preflight before payment
**Files:** `lib/data/cart.ts` (new `checkStockAvailability`), `modules/checkout/components/payment-button/index.tsx` (~136-209 gate before `stripe.confirmCardPayment`), `modules/checkout/components/review/index.tsx` (mount-time banner), `modules/cart/components/item/index.tsx` (OOS badge). Reuse `getProductsById` (already imported in cart.ts) + the `maxSelectableQty` logic in `modules/cart/components/item/max-qty.ts`. Test: the pure insufficiency check.
- [ ] Failing test: a pure `findInsufficientLines(items, liveVariants)` → returns the lines whose qty exceeds live availability (respecting `manage_inventory`/`allow_backorder`, mirroring `max-qty.ts`), naming the item.
- [ ] RED → implement: `checkStockAvailability(cart)` server action returns B2 `{ error?: string }` (naming the first insufficient item) using `getProductsById` + `findInsufficientLines`. Gate it at the START of `PaymentButton.handlePayment` (ALL payment buttons — Stripe/PayPal/manual): if it errors, show the error and **return WITHOUT calling `stripe.confirmCardPayment`/the provider**. Also call it on the Review step's mount to show a banner. Cart lines render an OOS/insufficient badge when live qty < line qty (display-only — the WB-034 cap stays).
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-092): stock preflight before payment capture (C2)`.

---

### Task 3: C3/C8 — honest failure states
**Files:** `lib/data/cart.ts` (~21-26 `retrieveCart`), `lib/data/orders.ts` (~8-17 `retrieveOrder`), `modules/checkout/templates/checkout-form/index.tsx` (~20-34), `app/[countryCode]/(main)/order/confirmed/[id]/page.tsx` (~16-18). Test: the error-class distinction.
- [ ] Failing test: `retrieveCart` on a network/5xx rethrows (→ boundary) but returns null for a 404/no-cart; `retrieveOrder` catches → null (so `notFound()` — currently DEAD code since it always throws — actually fires).
- [ ] RED → implement: `retrieveCart` distinguishes (only a genuine 404/absent cart → null; transport/5xx → throw). `retrieveOrder` catches → null. `CheckoutForm` renders an explicit "couldn't load delivery/payment options — retry" block instead of `null` when `!shippingMethods || !paymentMethods`. The confirmed page's copy (and/or the `(main)` boundary near it) reassures a just-charged customer: "your order may still have gone through — check your email".
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-092): distinguish outage from empty-cart/no-order + retry block (C3/C8)`.

---

### Task 4: C9 — extend the B2 error contract
**Files:** `lib/data/cart.ts` (`updateLineItem` ~137-159, `deleteLineItem` ~161-178, `applyPromotions` ~276-287 — all still `.catch(medusaError)`), callers: `modules/cart/components/item/index.tsx` (~34-44), `modules/common/components/delete-button/index.tsx` (~17-22), `modules/checkout/components/discount-code/index.tsx` (~31-46). Reuse `errText()` (`cart.ts:232-237`). Test: the return shapes.
- [ ] Failing test: `updateLineItem`/`deleteLineItem`/`applyPromotions` return `{ error }` (not throw) on failure.
- [ ] RED → implement: convert the three to `Promise<{error?: string}>` via `errText`; callers drop `.catch` for `res?.error` checks; `DeleteButton` surfaces failures via sonner (it's reused in the full cart + mini-cart — a toast fits both); `discount-code`'s two call sites add `res?.error` checks alongside the existing WB-071 F-G silent-no-op detection. Leave `updateCart` throwing (its other callers handle it).
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-092): B2 return-shape for updateLineItem/deleteLineItem/applyPromotions + surfaced DeleteButton errors (C9)`.

---

### Task 5: C4/C5/C10 — chrome trust + honest confirmation
**Files:** `app/[countryCode]/(checkout)/layout.tsx` (~35-63 phone/footer/badges), `modules/checkout/components/review/index.tsx` (~40-45 consent links), `modules/order/templates/order-completed-template.tsx` (~23-31,79-97,161), `modules/checkout/components/fitment-verified-card/index.tsx` (~37-46,73-77). Test: the fit-card `every` rule.
- [ ] Failing test: the fitment card claims "checked" only when EVERY line fits (currently `.some()`).
- [ ] RED → implement: (C4) remove the fake `(855) 555-RIDE` → "Need help? Contact us" → `/contact`; link the footer TERMS/PRIVACY/REFUND → `/terms` `/privacy` `/returns`; link the review-consent policy names; DROP the APPLE/GPAY badges. (C5) the confirmation's shipping line derives from `order.shipping_methods[0]` (name + real paid amount); ETA anchored to `order.created_at`; tracking copy → "we'll email tracking" (no SMS); the "we've sent a confirmation" line conditional/softened. (C10) the fit card requires `every` fitting line + refund copy aligned with the real conditional `/returns` policy (drop "refund every penny").
- [ ] GREEN vitest; `tsc`; grep no `555-RIDE`/`APPLE|GPAY` badge. Commit `fix(WB-092): checkout chrome trust + honest confirmation + fit-card every-line (C4/C5/C10)`.

---

### Task 6: C6/C7 — receipt correctness + line identity
**Files:** `modules/order/components/shipping-details/index.tsx` (~59-66 `.replace` mangle + unguarded `[0]`), `modules/order/components/payment-details/index.tsx` (~13 `[0]`, ~31/40 `paymentInfoMap[...]` no `?.`), `modules/common/components/line-item-options/index.tsx` (~21), `modules/cart/components/item/index.tsx` (~58-62), `modules/layout/components/cart-dropdown/index.tsx` (~145-149). Test: the money format + guards.
- [ ] Failing test: the shipping price renders `$10.00` (not `$10,00`); an empty `shipping_methods`/`payment_collections` array doesn't throw; an unmapped `provider_id` doesn't crash.
- [ ] RED → implement: (C6) delete the `.replace(/,/g,"").replace(/\./g,",")` chain; guard every `[0]` access (`?.[0]?.`); `paymentInfoMap[provider_id]?.title/.icon` with a fallback. **Do NOT mount PaymentDetails or add fulfillment fields — WB-093 owns that.** (C7) `LineItemOptions` renders the variant's option VALUES (checkout-summary parity — `item.variant?.options?.map(o=>o.value).join(" · ")`); cart + mini-cart thumbnails prefer `item.variant?.metadata?.image_url` (the per-finish image) before the product thumbnail.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-092): receipt decimal/guards + finish visible on cart lines (C6/C7)`.

---

### Task 7: C11–C14 — flow guards + nits
**Files:** `app/[countryCode]/(checkout)/checkout/page.tsx` (~39-51 step clamp), `lib/data/cookies.ts` (~37-45) + `lib/data/cart.ts` (~44 sliding renewal), `modules/checkout/components/shipping/index.tsx` (~97,115-122,139), `modules/checkout/components/payment/index.tsx` (~50), `modules/checkout/components/review/index.tsx` (~16-19), `app/[countryCode]/(main)/order/confirmed/[id]/page.tsx` (~9-11,30,33-34). Test: the step clamp.
- [ ] Failing test: a pure `furthestAllowedStep(cart)` → the deep-linked `?step=` clamps to the furthest allowed (address → shipping → payment → review) from cart state.
- [ ] RED → implement: (C11) server-side clamp in `checkout/page.tsx` using `furthestAllowedStep`. (C12) sliding cart-cookie renewal — call `setCartId` on cart reads (not just creation) so the 7-day window slides. (C13) shipping-option descriptions + a zero-options empty state (`availableShippingMethods.length === 0` → an explanatory block, not a silently-disabled button). (C14) `cart?.shipping_methods?.length` optional-chaining (payment:50, review:16-19); `await` the Next-15 `params` on the confirmed page (type `Promise<{id:string}>`); fix the "You purchase was successful" metadata typo.
- [ ] GREEN vitest; `tsc`; `npx next build` compiles. Commit `fix(WB-092): step clamp, sliding cart cookie, shipping-option copy, Next-15 params + nits (C11-C14)`.
