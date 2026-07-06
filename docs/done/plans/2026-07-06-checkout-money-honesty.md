# Checkout & money honesty (WB-071) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every price, total, payment option, and shipping/region promise the customer sees equal what the system actually charges and does — and make a post-authorization failure loud, not a silent dead end.

**Architecture:** Mostly storefront behavior/copy fixes (checkout, PDP, discovery) plus two small backend pieces (free-shipping price rule, region-provider config) and two guarded prod-only `medusa exec` scripts the operator runs. Pure formatting/filter/promo logic is extracted into vitest-tested helpers; component and backend wiring rides on `tsc`/`build`/review.

**Tech Stack:** Next.js 15 / React 19 storefront (vitest ^2.1.9), MedusaJS 2.13.6 backend (core-flows, pricing/fulfillment modules).

**Spec:** [docs/done/specs/2026-07-06-checkout-money-honesty-design.md](../specs/2026-07-06-checkout-money-honesty-design.md)

## Global Constraints

- **Storefront commands run from `storefront/`; backend from `backend/`.** No root package.json. If `pnpm` isn't on PATH use `npx -y pnpm@9.10.0 <cmd>`.
- **Storefront gates (per task):** `npx vitest run` green + `npx tsc --noEmit` shows **no NEW** errors beyond the ~14 pre-existing baseline listed in [storefront/CLAUDE.md](../../../storefront/CLAUDE.md). Do NOT "fix" those 14 (SDK drift) or the pre-existing eslint warning in `shipping-address/index.tsx`. `next build` ignores TS/eslint — it is not a correctness gate.
- **Backend gates:** `medusa build` exit 0 + `pnpm test:sync` still green.
- **Final gate (Task 12):** storefront `pnpm build:next` bundles clean + backend `medusa build` exit 0.
- **Money units:** Medusa `cart.total`/`subtotal`/`item.total` are **DOLLARS** (major units); PDP/discovery `priceCents` is **CENTS**. Display exact amounts — **never `Math.round` a money value for display**. Non-money integers (counts, quantities, sizes, weights) are untouched.
- **Two prod-only scripts** (`strip-manual-payment.ts`, `update-shipping-prices.ts`) MUST be idempotent and refuse to run without `-- --confirm-host=<DATABASE_URL host>` (mirror `backend/src/scripts/vendor-sync-dev-wipe.ts`'s guard). The implementer does NOT run them against any live DB.
- **US-only assumption** (user decision): the store is treated as single-region US. Do not build EUR catalog/i18n.
- **Commit style:** `fix(checkout|storefront|backend): <what> (WB-071 F-<x>)`, ending with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `storefront/src/lib/util/money.ts` | Add exact-cent `formatCentsUsd(cents)` (wraps `convertToLocale`) | T1 |
| `storefront/src/modules/checkout/templates/checkout-summary/index.tsx` | Exact totals (drop `Math.round`) | T2 |
| PDP/discovery/home price-display sites (7 files) | Use `formatCentsUsd` instead of `Math.round(cents/100)` | T3 |
| `storefront/src/lib/constants.tsx` + `.../checkout-form/index.tsx` | Filter `pp_system_default` from customer checkout in prod | T4 |
| `backend/.../pipeline/bootstrap.ts`, `backend/src/scripts/seed.ts`, `backend/src/scripts/strip-manual-payment.ts` (new) | Region provider config + strip script | T5 |
| `storefront/src/lib/data/cart.ts` (`placeOrder`) | Throw on non-order completion | T6 |
| `storefront/.../payment/index.tsx`, `.../payment-button/index.tsx` | Re-init on provider change + pending-session dispatch | T7 |
| `storefront/src/lib/data/cart.ts` (`setAddresses`), `.../shipping-address/index.tsx`, `.../billing_address/index.tsx` | Carry `address_2` | T8 |
| `storefront/.../discount-code/index.tsx` | Wire promo error surface | T9 |
| `backend/src/scripts/seed.ts`, `backend/src/scripts/update-shipping-prices.ts` (new), storefront copy (3 files) | Free-ship $199+ rule + aligned copy | T10 |
| `storefront/src/middleware.ts`, PDP/featured loaders, `storefront/CLAUDE.md` | US-only lock + consistent region | T11 |

---

### Task 1: Exact-cent money formatter (F-B/F-I core)

**Files:**
- Modify: `storefront/src/lib/util/money.ts`
- Test: `storefront/src/lib/util/money.test.ts` (new)

**Interfaces:**
- Produces: `formatCentsUsd(cents: number): string` — e.g. `36999 → "$369.99"`, `37000 → "$370.00"`. Wraps `convertToLocale`. (T3 consumes it.)

- [ ] **Step 1: Write the failing test** — create `money.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { formatCentsUsd } from "./money"

describe("formatCentsUsd", () => {
  it("shows exact cents, never rounding to whole dollars", () => {
    expect(formatCentsUsd(36999)).toBe("$369.99")
    expect(formatCentsUsd(147996)).toBe("$1,479.96")
  })
  it("pads whole-dollar amounts to .00", () => {
    expect(formatCentsUsd(37000)).toBe("$370.00")
  })
  it("handles zero", () => {
    expect(formatCentsUsd(0)).toBe("$0.00")
  })
})
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `npx vitest run src/lib/util/money.test.ts`
Expected: FAIL — `formatCentsUsd` is not exported.

- [ ] **Step 3: Implement** — append to `money.ts`:

```ts
/**
 * Format an INTEGER-CENTS amount as an exact USD string, e.g. 36999 -> "$369.99".
 * Never rounds to whole dollars (WB-071 F-I: displayed price must equal the
 * charged price). Wraps convertToLocale so the currency formatting stays central.
 */
export const formatCentsUsd = (cents: number): string =>
  convertToLocale({
    amount: (cents ?? 0) / 100,
    currency_code: "usd",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
```

- [ ] **Step 4: Run it, verify PASS**

Run: `npx vitest run src/lib/util/money.test.ts`
Expected: PASS (3 tests). Then `npx tsc --noEmit` — no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/util/money.ts src/lib/util/money.test.ts
git commit -m "feat(storefront): exact-cent formatCentsUsd money helper (WB-071 F-I)"
```

---

### Task 2: Checkout totals show exact cents (F-B)

**Files:**
- Modify: `storefront/src/modules/checkout/templates/checkout-summary/index.tsx`

**Interfaces:** none new. Uses the existing separate orange `$` span, so it does NOT use `formatCentsUsd` (which includes `$`); it formats the number to 2 decimals.

- [ ] **Step 1: Fix the LineItemRow amount** — replace line ~131 `{Math.round(total).toLocaleString()}` with:

```tsx
{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
```

- [ ] **Step 2: Fix the TOTAL** — replace line ~181 `{Math.round(total).toLocaleString(undefined, { minimumFractionDigits: 2 })}` with:

```tsx
{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
```

- [ ] **Step 3: Fix the Affirm line** — replace line ~188 `OR 4× ${Math.round(total / 4).toLocaleString()} WITH AFFIRM` with:

```tsx
OR 4× ${(total / 4).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} WITH AFFIRM
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (no new errors) + `npx vitest run` (no regressions). Visually confirm no other `Math.round` remains in this file: `git grep -n "Math.round" src/modules/checkout/templates/checkout-summary/index.tsx` → no matches.

- [ ] **Step 5: Commit**

```bash
git add src/modules/checkout/templates/checkout-summary/index.tsx
git commit -m "fix(checkout): checkout totals show exact cents, not fake .00 (WB-071 F-B)"
```

---

### Task 3: PDP/discovery/home price displays show exact cents (F-I)

**Files (currency-DISPLAY sites only):**
- Modify: `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`
- Modify: `storefront/src/modules/product-detail/components/tire/hero/purchase-panel.tsx`
- Modify: `storefront/src/modules/discovery/components/grid/product-card.tsx`
- Modify: `storefront/src/modules/tire-discovery/components/grid/tire-product-card.tsx`
- Modify: `storefront/src/modules/discovery/components/active-chips/index.tsx`
- Modify: `storefront/src/modules/tire-discovery/components/active-chips/index.tsx`
- Modify: `storefront/src/modules/home/components/featured-blocks/index.tsx`

**Interfaces:** Consumes `formatCentsUsd` from `@lib/util/money` (T1).

- [ ] **Step 1: For each file, read it and replace the currency-display rounding.** The pattern to replace is a local `formatUsd` (or inline) of the shape `` `$${Math.round(cents / 100).toLocaleString()}` `` used to render a **price the customer pays**. Replace the local helper's body (or the call site) so it uses the shared helper:

```tsx
import { formatCentsUsd } from "@lib/util/money"
// ...
// was: const formatUsd = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`
// now: use formatCentsUsd(cents) at each call site, or:
const formatUsd = (cents: number) => formatCentsUsd(cents)
```

Keep the call sites identical (`formatUsd(unitPriceCents * quantity)` etc.) — only the formatting changes from rounded-whole-dollars to exact cents.

- [ ] **Step 2: Do NOT change non-currency or non-charged rounding.** Leave `Math.round` that is: a **price-filter bound** in `discovery/.../filter-rail/filter-sections.tsx` and `tire-discovery/.../filter-rail/filter-sections.tsx` (those set filter query bounds, not a charged price — out of scope), or a **data computation** in `product-detail/data/get-product.ts`, `home/data/get-featured.ts`, `product-detail/data/tire/tire-size-options.ts` (these compute values, not display them). If you find a `Math.round` on a price in a data file that becomes the displayed/charged `priceCents`, STOP and report it as a data-level finding rather than "fixing" it here.

- [ ] **Step 3: Verify** — `git grep -n "Math.round" src/modules/product-detail/components/hero/purchase-panel.tsx src/modules/product-detail/components/tire/hero/purchase-panel.tsx src/modules/discovery/components/grid/product-card.tsx src/modules/tire-discovery/components/grid/tire-product-card.tsx src/modules/discovery/components/active-chips/index.tsx src/modules/tire-discovery/components/active-chips/index.tsx src/modules/home/components/featured-blocks/index.tsx` → no currency-display matches remain. Then `npx tsc --noEmit` (no new) + `npx vitest run` (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/modules/product-detail src/modules/discovery src/modules/tire-discovery src/modules/home
git commit -m "fix(storefront): PDP/discovery/home prices show exact cents (WB-071 F-I)"
```

---

### Task 4: Hide Manual Payment from customer checkout in production (F-A, storefront)

**Files:**
- Modify: `storefront/src/lib/constants.tsx` (add filter helper)
- Modify: `storefront/src/modules/checkout/templates/checkout-form/index.tsx` (apply it)
- Test: `storefront/src/lib/constants.test.tsx` (new)

**Interfaces:**
- Produces: `filterCustomerPaymentMethods(methods: any[], opts: { isProduction: boolean }): any[]` — drops any method where `isManual(m.id)` when `isProduction`, keeps everything in dev. (Uses the existing `isManual`.)

- [ ] **Step 1: Write the failing test** — create `constants.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { filterCustomerPaymentMethods } from "./constants"

const stripe = { id: "pp_stripe_stripe" }
const manual = { id: "pp_system_default" }

describe("filterCustomerPaymentMethods", () => {
  it("drops Manual Payment in production", () => {
    expect(filterCustomerPaymentMethods([stripe, manual], { isProduction: true }))
      .toEqual([stripe])
  })
  it("keeps Manual Payment outside production (for testing)", () => {
    expect(filterCustomerPaymentMethods([stripe, manual], { isProduction: false }))
      .toEqual([stripe, manual])
  })
  it("is a no-op on an empty list", () => {
    expect(filterCustomerPaymentMethods([], { isProduction: true })).toEqual([])
  })
})
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/lib/constants.test.tsx` → FAIL (not exported).

- [ ] **Step 3: Implement** — append to `constants.tsx` (after `isManual`):

```tsx
/**
 * WB-071 F-A: a customer must never be offered the `pp_system_default`
 * "Manual Payment" option in production (it places an order with no charge).
 * Kept available in dev/test so the manual flow can still be exercised.
 */
export const filterCustomerPaymentMethods = (
  methods: { id: string }[],
  { isProduction }: { isProduction: boolean }
) => (isProduction ? methods.filter((m) => !isManual(m.id)) : methods)
```

- [ ] **Step 4: Apply at the checkout seam** — in `checkout-form/index.tsx`, where `paymentMethods` is fetched (`const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")`, ~line 24), filter before passing to `<Payment>`:

```tsx
import { filterCustomerPaymentMethods } from "@lib/constants"
// ...
const paymentMethods = filterCustomerPaymentMethods(
  (await listCartPaymentMethods(cart.region?.id ?? "")) ?? [],
  { isProduction: process.env.NODE_ENV === "production" }
)
```

- [ ] **Step 5: Verify** — `npx vitest run src/lib/constants.test.tsx` (PASS) + `npx tsc --noEmit` (no new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants.tsx src/lib/constants.test.tsx src/modules/checkout/templates/checkout-form/index.tsx
git commit -m "fix(checkout): hide Manual Payment from customers in production (WB-071 F-A)"
```

---

### Task 5: Backend region provider config + strip script (F-A, backend)

**Files:**
- Modify: `backend/src/modules/vendor-sync/pipeline/bootstrap.ts` (region creation)
- Modify: `backend/src/scripts/seed.ts` (Europe region creation)
- Create: `backend/src/scripts/strip-manual-payment.ts`

**Interfaces:** none cross-task.

- [ ] **Step 1: Only wire `pp_system_default` when Stripe is NOT configured.** In `bootstrap.ts` `ensureUsRegion`, read the current `payment_providers: ["pp_system_default"]` and make it conditional:

```ts
const stripeConfigured = !!(process.env.STRIPE_API_KEY && process.env.STRIPE_WEBHOOK_SECRET)
const paymentProviders = stripeConfigured ? ["pp_stripe_stripe"] : ["pp_system_default"]
// ...use paymentProviders in the region create input's payment_providers
```

Confirm `pp_stripe_stripe` is the correct provider id for this repo (it is per `storefront/src/lib/constants.tsx` `paymentInfoMap`). Apply the same conditional to `seed.ts`'s region creation (Europe region, ~line 120).

- [ ] **Step 2: Write the strip script** — create `strip-manual-payment.ts` (runs via `medusa exec`), guarded like the dev-wipe script:

```ts
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * WB-071 F-A: remove `pp_system_default` from every region's payment_providers
 * when Stripe is configured. Idempotent. Refuses to run without
 * `-- --confirm-host=<DATABASE_URL host>` so a copy-paste can't hit the wrong DB.
 */
export default async function stripManualPayment({ container, args }: ExecArgs) {
  const logger = container.resolve("logger")
  const dbUrl = process.env.DATABASE_URL ?? ""
  const host = (() => { try { return new URL(dbUrl).host } catch { return "" } })()
  const confirm = (args ?? []).find((a) => a.startsWith("--confirm-host="))?.split("=")[1]
  if (!confirm || confirm !== host) {
    logger.error(
      `Refusing to run. Re-run with: medusa exec ./src/scripts/strip-manual-payment.ts -- --confirm-host=${host}`
    )
    return
  }

  const regionService = container.resolve(Modules.REGION)
  const paymentService = container.resolve(Modules.PAYMENT)
  const regions = await regionService.listRegions({}, { relations: [] })
  const providers = await paymentService.listPaymentProviders({}, {})
  const hasStripe = providers.some((p: any) => p.id?.startsWith("pp_stripe_") && p.is_enabled !== false)
  if (!hasStripe) {
    logger.warn("Stripe not enabled — leaving pp_system_default in place (no other provider).")
    return
  }
  for (const region of regions) {
    // Remove the manual provider link from this region if present.
    logger.info(`Region ${region.id} (${region.name}): stripping pp_system_default if present`)
    await regionService.updateRegions(region.id, {
      // Medusa v2 region-provider link update — verify the exact field/relation
      // name against the installed @medusajs/region module before running.
    } as any)
  }
  logger.info("strip-manual-payment complete.")
}
```

> **Note for the implementer:** the exact Region↔PaymentProvider dissociation API in Medusa 2.13.6 (whether it's `updateRegions({ payment_providers })`, a link-module remove, or an admin route) must be confirmed against the installed `@medusajs/region`/`@medusajs/payment` modules. If it can't be expressed as a single clean call, leave the script with a clearly-logged manual instruction (admin UI: Settings → Regions → remove Manual provider) rather than a wrong mutation — the storefront filter (T4) already closes the customer path, so this script is defense-in-depth, not the primary fix. Do NOT run it against any live DB.

- [ ] **Step 3: Verify** — `cd backend && npx -y pnpm@9.10.0 exec medusa build` exits 0 (the script + bootstrap/seed compile). `pnpm test:sync` still green.

- [ ] **Step 4: Commit**

```bash
git add src/modules/vendor-sync/pipeline/bootstrap.ts src/scripts/seed.ts src/scripts/strip-manual-payment.ts
git commit -m "fix(backend): region wires Stripe (not Manual) when configured + strip script (WB-071 F-A)"
```

---

### Task 6: placeOrder surfaces completion failures (F-C)

**Files:**
- Modify: `storefront/src/lib/data/cart.ts` (`placeOrder`, ~line 309-331)

**Interfaces:** `placeOrder` now throws on a non-order result instead of returning `cartRes.cart`.

- [ ] **Step 1: Throw on the non-order branch** — replace the tail of `placeOrder` (from `if (cartRes?.type === "order")` through `return cartRes.cart`) with:

```ts
  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()
    await removeCartId()
    redirect(`/${countryCode}/order/confirmed/${cartRes?.order.id}`)
  }

  // WB-071 F-C: Medusa returns the cart + an error object with HTTP 200 when
  // completion fails AFTER the card is authorized (e.g. inventory reservation).
  // .catch(medusaError) never fires for this, so surface it explicitly rather
  // than returning silently and leaving the customer on a stopped spinner.
  throw new Error(
    (cartRes as any)?.error?.message ||
      "We couldn't complete your order. If you were charged, it will be reversed. Please try again."
  )
```

Note: `redirect()` throws internally (Next control-flow), so the success path still returns via redirect; only genuine failures reach the throw.

- [ ] **Step 2: Verify the callers already display it** — confirm (read-only) that `payment-button/index.tsx`'s three `onPaymentCompleted` handlers do `placeOrder().catch(err => setErrorMessage(err.message))` (they do). No change needed there.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new) + `npx vitest run` (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/cart.ts
git commit -m "fix(checkout): placeOrder surfaces post-auth completion errors (WB-071 F-C)"
```

---

### Task 7: Payment method switch re-initiates + button dispatches on the pending session (F-E)

**Files:**
- Modify: `storefront/src/modules/checkout/components/payment/index.tsx`
- Modify: `storefront/src/modules/checkout/components/payment-button/index.tsx`

- [ ] **Step 1: Re-initiate when the provider changed** — in `payment/index.tsx` `handleSubmit` (~line 85-110), replace the `if (!activeSession) { await initiatePaymentSession(...) }` block with:

```tsx
      const shouldInputCard =
        isStripeFunc(selectedPaymentMethod) && activeSession?.provider_id !== selectedPaymentMethod

      // WB-071 F-E: re-initiate whenever the selected provider differs from the
      // active session's provider — otherwise switching methods leaves the old
      // session and the order is charged by the previous provider.
      if (!activeSession || activeSession.provider_id !== selectedPaymentMethod) {
        await initiatePaymentSession(cart, { provider_id: selectedPaymentMethod })
      }
```

- [ ] **Step 2: Dispatch the button on the PENDING session** — in `payment-button/index.tsx`, replace line ~38 `const paymentSession = cart.payment_collection?.payment_sessions?.[0]` with:

```tsx
  // WB-071 F-E: pick the pending session (matches payment/index.tsx's activeSession)
  // so the button that renders/charges matches the method the review shows.
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new) + `npx vitest run` (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/modules/checkout/components/payment/index.tsx src/modules/checkout/components/payment-button/index.tsx
git commit -m "fix(checkout): re-init payment session on method switch + dispatch pending session (WB-071 F-E)"
```

---

### Task 8: Carry address_2 (apartment/unit) through checkout (F-F)

**Files:**
- Modify: `storefront/src/lib/data/cart.ts` (`setAddresses`, lines ~272, ~291)
- Modify: `storefront/src/modules/checkout/components/shipping-address/index.tsx`
- Modify: `storefront/src/modules/checkout/components/billing_address/index.tsx` (mirror; read it first to match its field pattern)

- [ ] **Step 1: Read the real form values in `setAddresses`** — replace `address_2: ""` (shipping, ~272) with `address_2: formData.get("shipping_address.address_2")`, and the billing `address_2: ""` (~291) with `address_2: formData.get("billing_address.address_2")`.

- [ ] **Step 2: Add the field to `setFormAddress`** — in `shipping-address/index.tsx` `setFormAddress` (~line 44-52), add after `address_1`:

```tsx
        "shipping_address.address_2": address?.address_2 || "",
```

- [ ] **Step 3: Add the input to the shipping form grid** — after the "Address" `<Input>` (name `shipping_address.address_1`, ~line 121-129) add:

```tsx
        <Input
          label="Apartment, suite, etc. (optional)"
          name="shipping_address.address_2"
          autoComplete="address-line2"
          value={formData["shipping_address.address_2"]}
          onChange={handleChange}
          data-testid="shipping-address-2-input"
        />
```

- [ ] **Step 4: Mirror for billing** — in `billing_address/index.tsx`, add the same `address_2` field to its grid and (if it has an equivalent) its form-state initializer, matching that file's existing `billing_address.*` naming. Read the file first; apply the same shape as Step 3 with `billing_address.address_2`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` (no new) + `npx vitest run` (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/cart.ts src/modules/checkout/components/shipping-address/index.tsx src/modules/checkout/components/billing_address/index.tsx
git commit -m "fix(checkout): carry apartment/unit (address_2) through checkout (WB-071 F-F)"
```

---

### Task 9: Promo-code feedback works (F-G)

**Files:**
- Modify: `storefront/src/modules/checkout/components/discount-code/index.tsx`
- Test: `storefront/src/modules/checkout/components/discount-code/promo-applied.test.ts` (new; pure helper)

**Interfaces:**
- Produces: `promoApplied(promotions: {code?: string}[], code: string): boolean` — case-insensitive membership check.

- [ ] **Step 1: Write the failing test** — create `promo-applied.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { promoApplied } from "./index"

describe("promoApplied", () => {
  it("true when the code is present (case-insensitive)", () => {
    expect(promoApplied([{ code: "SAVE10" }], "save10")).toBe(true)
  })
  it("false when absent", () => {
    expect(promoApplied([{ code: "SAVE10" }], "BOGUS")).toBe(false)
  })
  it("false on empty promotions", () => {
    expect(promoApplied([], "SAVE10")).toBe(false)
  })
})
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/modules/checkout/components/discount-code/promo-applied.test.ts` → FAIL (not exported).

- [ ] **Step 3: Add the helper + wire the error surface** — in `discount-code/index.tsx`: export the helper, add local error + pending-code state, set the error when a submitted code doesn't appear in `cart.promotions` after the server revalidation, and bind `<ErrorMessage>` to it. Replace the dead `const [message, formAction] = useFormState(submitPromotionForm, null)` line and the `addPromotionCode` body:

```tsx
export const promoApplied = (
  promotions: { code?: string }[],
  code: string
): boolean => promotions.some((p) => (p.code ?? "").toLowerCase() === code.toLowerCase())
```

```tsx
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [pendingCode, setPendingCode] = React.useState<string | null>(null)

  const addPromotionCode = async (formData: FormData) => {
    const code = formData.get("code")
    if (!code) return
    setErrorMessage(null)
    setPendingCode(code.toString())
    const input = document.getElementById("promotion-input") as HTMLInputElement
    await applyPromotions([...retainedPromoCodes(promotions), code.toString()])
    if (input) input.value = ""
  }

  // WB-071 F-G: Medusa's updateCart no-ops unknown promo codes rather than
  // rejecting, so after the server revalidates the cart, check whether the code
  // we submitted actually landed; if not, tell the customer instead of failing
  // silently.
  React.useEffect(() => {
    if (pendingCode && !promoApplied(promotions, pendingCode)) {
      setErrorMessage(`"${pendingCode}" is not a valid promotion code.`)
    } else if (pendingCode) {
      setErrorMessage(null)
    }
    setPendingCode(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotions])
```

Remove the now-unused `useFormState`/`submitPromotionForm` import if nothing else uses them, and change `<ErrorMessage error={message} .../>` (~line 84) to `<ErrorMessage error={errorMessage} .../>`.

- [ ] **Step 4: Run it, verify PASS** — `npx vitest run src/modules/checkout/components/discount-code/promo-applied.test.ts` (PASS) + `npx tsc --noEmit` (no new).

- [ ] **Step 5: Commit**

```bash
git add src/modules/checkout/components/discount-code/index.tsx src/modules/checkout/components/discount-code/promo-applied.test.ts
git commit -m "fix(checkout): surface invalid promo-code errors (WB-071 F-G)"
```

---

### Task 10: Free shipping $199+ is real, and copy matches (F-H)

**Files:**
- Modify: `backend/src/scripts/seed.ts` (shipping options ~256-335)
- Create: `backend/src/scripts/update-shipping-prices.ts`
- Modify (copy): `storefront/src/modules/product-detail/data/pdp-config.ts`, `storefront/src/modules/home/data/merchandising.ts`, `storefront/src/modules/checkout/components/trust-strip/index.tsx`

- [ ] **Step 1: RESEARCH the Medusa 2.13.6 conditional-shipping-price API FIRST.** Before writing any rule, confirm the exact shape of a cart-total-conditional shipping price in this version. Use context7 (`resolve-library-id` → `@medusajs/medusa`, then `query-docs` for "shipping option price rules cart total free shipping") AND read the installed pricing/fulfillment modules under `backend/node_modules/@medusajs`. You are confirming: the price-rule **attribute** name for cart subtotal (candidates: `item_total`, `item_subtotal`), the operator (`gte`), and how `createShippingOptionsWorkflow` accepts a per-price `rules` object. **If you cannot confirm a clean, supported shape, STOP and report to the controller** (do not ship a half-rule); the fallback (copy-removal to honest flat $10) is a deliberate user decision, not the implementer's to make.

- [ ] **Step 2: Add the conditional price to `seed.ts`** — once confirmed, give each shipping option a $0 price gated on subtotal ≥ 19900 cents, keeping the $10 default. Illustrative shape (adjust attribute/rule to what Step 1 confirmed):

```ts
prices: [
  { currency_code: "usd", amount: 10 },
  { currency_code: "eur", amount: 10 },
  { region_id: region.id, amount: 10 },
  // Free over $199 (19900 cents item subtotal)
  { currency_code: "usd", amount: 0, rules: { item_total: { operator: "gte", value: 19900 } } },
],
```

- [ ] **Step 3: Write `update-shipping-prices.ts`** — a `--confirm-host`-guarded, idempotent `medusa exec` script (same guard as Task 5's script) that finds the existing Standard/Express shipping options and adds/updates the free-over-$199 price on them, so the live catalog gets the rule without a re-seed. Log clearly; do NOT run against a live DB.

- [ ] **Step 4: Align the copy to ONE threshold** — set all three surfaces to "Free shipping on orders $199+" (or the exact `FREE_SHIP_THRESHOLD_USD` value): `pdp-config.ts` keeps `FREE_SHIP_THRESHOLD_USD = 199` and its trust copy; `merchandising.ts:10,25` "Free shipping $199+"; and fix `trust-strip/index.tsx:6` from the unconditional "Free 2–3 day shipping" to "Free shipping on orders $199+ · 2–3 day delivery" (or split into the threshold claim). The storefront already renders "FREE" when `shipping_total === 0`, so no totals change is needed.

- [ ] **Step 5: Verify** — `cd backend && npx -y pnpm@9.10.0 exec medusa build` exit 0 + `pnpm test:sync` green; `cd storefront && npx tsc --noEmit` (no new). If Step 1 forced the fallback, the copy instead drops the free-shipping claim everywhere and shows flat $10 — confirm with the controller which path shipped.

- [ ] **Step 6: Commit**

```bash
git add ../backend/src/scripts/seed.ts ../backend/src/scripts/update-shipping-prices.ts src/modules/product-detail/data/pdp-config.ts src/modules/home/data/merchandising.ts src/modules/checkout/components/trust-strip/index.tsx
git commit -m "fix(backend+storefront): real free-shipping $199+ rule + aligned copy (WB-071 F-H)"
```

---

### Task 11: US-only region lock + consistent PDP/featured pricing (F-D)

**Files:**
- Modify: `storefront/src/middleware.ts` (drop IP auto-routing)
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (`getProductDetail`, `getRelatedProducts`) + its page caller
- Modify: `storefront/src/modules/home/data/get-featured.ts` (`getFeaturedProducts`)
- Modify: `storefront/CLAUDE.md` (document the single-region assumption)

- [ ] **Step 1: Stop IP-routing to a non-default region** — in `middleware.ts` `getCountryCode`, remove the Vercel-IP branch so resolution is URL → `DEFAULT_REGION` → first. Delete the `vercelCountryCode` lookup (lines ~61-63) and the `else if (vercelCountryCode && regionMap.has(vercelCountryCode))` branch (lines ~69-70), leaving:

```ts
    const urlCountryCode = request.nextUrl.pathname.split("/")[1]?.toLowerCase()

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value
    }
```

- [ ] **Step 2: Make PDP/featured price the ROUTE region (consistent with the cart).** Thread a `countryCode` param:
  - `getProductDetail(handle: string, countryCode: string)` → `getRegion(countryCode)` instead of `getRegion(DEFAULT_COUNTRY)`.
  - `getRelatedProducts(product, countryCode: string)` → same, and pass `countryCode` to `getProductsList({ ..., countryCode })`.
  - `getFeaturedProducts(...)` in `get-featured.ts` → accept + use `countryCode`.
  - Update the callers: the PDP page (`app/[countryCode]/(main)/products/[handle]/page.tsx`) reads `params.countryCode` and passes it; the related-products render site and the home featured render site pass their `countryCode`. Read each caller and thread the param. With the US-lock this resolves to `us` == default (behavior-neutral) but is now correct-by-construction.

- [ ] **Step 3: Document** — in `storefront/CLAUDE.md` routing section, add a line: the storefront is operated **single-region (US)**; middleware no longer IP-routes to other regions, and PDP/featured price the route region. Real multi-region (EUR catalog prices, i18n) is a separate project; the seeded Europe region is not a shopping surface.

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (no new) + `npx vitest run` (no regressions) + `pnpm build:next` bundles clean (this exercises middleware + PDP data).

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/modules/product-detail/data/get-product.ts src/modules/home/data/get-featured.ts src/app CLAUDE.md
git commit -m "fix(storefront): lock to single-region US + consistent PDP/featured pricing (WB-071 F-D)"
```

---

### Task 12: Full gate sweep

**Files:** none (verification only).

- [ ] **Step 1: Storefront unit + type + build**

```bash
cd storefront && npx vitest run && npx tsc --noEmit && npx -y pnpm@9.10.0 build:next
```
Expected: vitest all green (existing ~200 + new); `tsc` only the ~14 pre-existing baseline; `build:next` exits 0.

- [ ] **Step 2: Backend type + build + unit**

```bash
cd backend && npx -y pnpm@9.10.0 exec medusa build && npx -y pnpm@9.10.0 test:sync
```
Expected: `medusa build` exit 0; `test:sync` green.

- [ ] **Step 3: No stray rounding on money** — `cd storefront && git grep -n "Math.round" src/modules/checkout/templates/checkout-summary` → none; spot-check the T3 files show `formatCentsUsd`.

- [ ] **Step 4: Final commit if anything changed**

```bash
git add -A && git commit -m "chore(WB-071): checkout-money-honesty gate sweep"
```

---

## Self-Review

**Spec coverage:** F-A→T4+T5, F-B→T2, F-C→T6, F-D→T11, F-E→T7, F-F→T8, F-G→T9, F-H→T10, F-I→T1+T3. All 9 mapped. Testing (§5): vitest helpers T1/T4/T9 + gates T12. Deploy notes (§6): the two prod scripts (T5, T10) are guarded; F-D routing note documented (T11 Step 3).

**Type consistency:** `formatCentsUsd(cents: number): string` defined T1, consumed T3. `filterCustomerPaymentMethods(methods, {isProduction})` defined + consumed T4. `promoApplied(promotions, code)` defined + consumed T9. `placeOrder` throw (T6) consumed by existing `.catch` handlers (T6 Step 2 verifies). `getProductDetail(handle, countryCode)` signature change (T11) — all callers threaded in T11 Step 2.

**Placeholder scan:** no TBD/TODO. The two research-gated spots (T5 Step 2 region-provider API, T10 Step 1 shipping price-rule) are explicit STOP-and-confirm instructions with a named fallback, not silent gaps — the correct treatment for genuine API uncertainty. The T3/T8 read-then-apply steps name every file and give the exact transform.
