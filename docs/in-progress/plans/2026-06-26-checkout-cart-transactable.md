# Checkout & cart transactable (G2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the genuinely-broken pieces of the buy path (checkout stall, live-stock qty cap, discount wipe-all bug, stale copy), env-gate the non-functional express-pay/Affirm chrome, and lift the Meili browse cap.

**Architecture:** Pure, unit-testable helpers carry the logic (qty cap, retained promo codes, env flags); React/server components are thin consumers. One backend config line for WB-053. No DB migration, no new dependency.

**Tech Stack:** Next.js 15 / React 19 storefront (Vitest), MedusaJS 2.13.6 backend. TypeScript.

Spec: [docs/in-progress/specs/2026-06-26-checkout-cart-transactable-design.md](../specs/2026-06-26-checkout-cart-transactable-design.md)

## Global Constraints

- **No `wb-`/`WB`/`wheelbuilds-` prefix** on any identifier, file, export, or CSS class.
- **Storefront tests:** `cd storefront && pnpm test:unit` (= `vitest run`). Focused: append `-- <name>`.
- **Storefront typecheck:** `cd storefront && npx tsc --noEmit`. There are **15 pre-existing TS errors on `main`** (in `lib/data/*`, `modules/order/templates/order-completed-template.tsx`, `modules/products/*`, `product-detail/data/resolve-variant.test.ts`). Do NOT fix them; only confirm your change adds **no NEW** errors.
- **Backend config check:** `cd backend && node --check medusa-config.js` (syntax only — do not boot Medusa).
- **Path aliases (storefront):** `@lib/*` → `src/lib/*`, `@modules/*` → `src/modules/*`. `@/*` is shadcn-only.
- **Brand name** for customer-facing copy: **Wheel Builds**.
- **Env flags are default-OFF:** `NEXT_PUBLIC_EXPRESS_PAY_ENABLED` and `NEXT_PUBLIC_AFFIRM_ENABLED` enable UI only — they do NOT wire a provider.
- `pnpm` may not be on PATH on Windows — fall back to `npx -y pnpm@9.10.0 <script>`.
- Frequent commits — one per task. End each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: WB-034 — cart qty cap honors live stock

**Files:**
- Create: `storefront/src/modules/cart/components/item/max-qty.ts`
- Create: `storefront/src/modules/cart/components/item/max-qty.test.ts`
- Modify: `storefront/src/modules/cart/components/item/index.tsx` (lines ~45-47 and ~88-91)

**Interfaces:**
- Produces: `maxSelectableQty(variant, currentQty: number): number` from `./max-qty`.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/modules/cart/components/item/max-qty.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { maxSelectableQty } from "./max-qty"

describe("maxSelectableQty", () => {
  it("managed + no backorder: caps at live stock", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 3 }, 1)).toBe(3)
  })
  it("never returns below the qty already in the cart", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 3 }, 5)).toBe(5)
  })
  it("unmanaged inventory: falls back to FALLBACK_MAX (10)", () => {
    expect(maxSelectableQty({ manage_inventory: false, inventory_quantity: 2 }, 1)).toBe(10)
  })
  it("backorder allowed: falls back to FALLBACK_MAX (10)", () => {
    expect(maxSelectableQty({ manage_inventory: true, allow_backorder: true, inventory_quantity: 2 }, 1)).toBe(10)
  })
  it("zero stock but item already in cart: stays at current qty", () => {
    expect(maxSelectableQty({ manage_inventory: true, inventory_quantity: 0 }, 2)).toBe(2)
  })
  it("undefined variant: FALLBACK_MAX", () => {
    expect(maxSelectableQty(undefined, 1)).toBe(10)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- max-qty`
Expected: FAIL — `Cannot find module './max-qty'`.

- [ ] **Step 3: Implement the helper**

Create `storefront/src/modules/cart/components/item/max-qty.ts`:

```ts
/** Unmanaged / backorderable lines have no real stock ceiling — cap at a sane default. */
const FALLBACK_MAX = 10

type StockShape = {
  inventory_quantity?: number | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

/**
 * Max quantity selectable for a cart line. Honors live inventory only when the
 * variant manages stock AND disallows backorder; otherwise falls back to a sane
 * cap. Never returns below currentQty, so a stock drop after add-to-cart cannot
 * make the already-in-cart quantity unselectable. (WB-034)
 */
export function maxSelectableQty(
  variant: StockShape | undefined,
  currentQty: number
): number {
  const managed = variant?.manage_inventory === true
  const backorder = variant?.allow_backorder === true
  if (!managed || backorder) return Math.max(FALLBACK_MAX, currentQty)
  const stock = Math.max(0, variant?.inventory_quantity ?? 0)
  return Math.max(stock, currentQty)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && pnpm test:unit -- max-qty`
Expected: PASS (6 cases).

- [ ] **Step 5: Wire the helper into the cart item**

In `storefront/src/modules/cart/components/item/index.tsx`:
1. Add the import near the other imports at the top:

```ts
import { maxSelectableQty } from "./max-qty"
```

2. Replace the hardcoded cap block (currently lines ~45-47):

```ts
  // TODO: Update this to grab the actual max inventory
  const maxQtyFromInventory = 10
  const maxQuantity = item.variant?.manage_inventory ? 10 : maxQtyFromInventory
```

with:

```ts
  const maxQuantity = maxSelectableQty(item.variant, item.quantity)
```

3. In the `<option>` generation (currently `length: Math.min(maxQuantity, 10)` at line ~90), use the cap directly:

```ts
              {Array.from(
                {
                  length: maxQuantity,
                },
                (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1}
                  </option>
                )
              )}
```

(Leave the rest of the `CartItemSelect` block, including the trailing `<option value={1}>` line, unchanged — that pre-existing oddity is out of scope.)

- [ ] **Step 6: Typecheck + full suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors (if `item.variant`'s type lacks `inventory_quantity`, cast the argument `item.variant as any` — the enriched runtime object carries the field); vitest PASS.

- [ ] **Step 7: Commit**

```bash
git add storefront/src/modules/cart/components/item/max-qty.ts storefront/src/modules/cart/components/item/max-qty.test.ts storefront/src/modules/cart/components/item/index.tsx
git commit -m "fix(cart): cap line qty at live inventory instead of hardcoded 10 (WB-034)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: WB-036 — fix discount remove/add wipe-all bug; delete dead gift-card stubs

**Files:**
- Create: `storefront/src/modules/checkout/components/discount-code/promo-codes.ts`
- Create: `storefront/src/modules/checkout/components/discount-code/promo-codes.test.ts`
- Modify: `storefront/src/modules/checkout/components/discount-code/index.tsx` (lines ~25-51)
- Modify: `storefront/src/lib/data/cart.ts` (delete the three dead stubs, lines ~244-285)

**Interfaces:**
- Produces: `retainedPromoCodes(promotions, removeCode?): string[]` from `./promo-codes`.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/modules/checkout/components/discount-code/promo-codes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { retainedPromoCodes } from "./promo-codes"

const promo = (code: string | undefined) => ({ code }) as any

describe("retainedPromoCodes", () => {
  it("keeps all manual codes when no removeCode is given (add path)", () => {
    expect(retainedPromoCodes([promo("A"), promo("B")])).toEqual(["A", "B"])
  })
  it("excludes exactly the removed code (remove path)", () => {
    expect(retainedPromoCodes([promo("A"), promo("B")], "B")).toEqual(["A"])
  })
  it("drops automatic promotions (code null/undefined) — Medusa re-derives them", () => {
    expect(retainedPromoCodes([promo("A"), promo(undefined)])).toEqual(["A"])
  })
  it("empty list → empty", () => {
    expect(retainedPromoCodes([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- promo-codes`
Expected: FAIL — `Cannot find module './promo-codes'`.

- [ ] **Step 3: Implement the helper**

Create `storefront/src/modules/checkout/components/discount-code/promo-codes.ts`:

```ts
import { HttpTypes } from "@medusajs/types"

/**
 * The manual (user-entered) promo codes to send back to the cart. Pass
 * removeCode to exclude exactly one (remove path); omit it to retain all manual
 * codes (add path, before pushing the new code). Automatic promotions
 * (code == null) are filtered OUT — Medusa re-derives them — so they are never
 * echoed back. Fixes the inverted `=== undefined` filter that wiped all codes. (WB-036)
 */
export function retainedPromoCodes(
  promotions: HttpTypes.StorePromotion[],
  removeCode?: string
): string[] {
  return promotions
    .filter((p) => p.code != null && p.code !== removeCode)
    .map((p) => p.code as string)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && pnpm test:unit -- promo-codes`
Expected: PASS (4 cases).

- [ ] **Step 5: Rewire the discount component**

In `storefront/src/modules/checkout/components/discount-code/index.tsx`:
1. Add the import (next to the existing `@lib/data/cart` import):

```ts
import { retainedPromoCodes } from "./promo-codes"
```

2. Replace `removePromotionCode` (currently lines ~25-33):

```ts
  const removePromotionCode = async (code: string) => {
    const validPromotions = promotions.filter(
      (promotion) => promotion.code !== code
    )

    await applyPromotions(
      validPromotions.filter((p) => p.code === undefined).map((p) => p.code!)
    )
  }
```

with:

```ts
  const removePromotionCode = async (code: string) => {
    await applyPromotions(retainedPromoCodes(promotions, code))
  }
```

3. Replace the codes accumulation in `addPromotionCode` (currently lines ~41-44):

```ts
    const codes = promotions
      .filter((p) => p.code === undefined)
      .map((p) => p.code!)
    codes.push(code.toString())

    await applyPromotions(codes)
```

with:

```ts
    await applyPromotions([...retainedPromoCodes(promotions), code.toString()])
```

- [ ] **Step 6: Delete the dead gift-card stubs**

In `storefront/src/lib/data/cart.ts`, delete the three commented-out no-op functions in their entirety (currently lines ~244-285): `applyGiftCard`, `removeDiscount`, and `removeGiftCard`. (Confirmed unused — the only references in `storefront/src` are their own definitions.) Leave `applyPromotions` and `submitPromotionForm` untouched.

- [ ] **Step 7: Typecheck + full suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors; vitest PASS. (If tsc reports an "unused" error for `submitPromotionForm` or others, that's pre-existing — confirm it's not in a file you changed.)

- [ ] **Step 8: Commit**

```bash
git add storefront/src/modules/checkout/components/discount-code/promo-codes.ts storefront/src/modules/checkout/components/discount-code/promo-codes.test.ts storefront/src/modules/checkout/components/discount-code/index.tsx storefront/src/lib/data/cart.ts
git commit -m "fix(checkout): discount remove/add no longer wipes all codes; drop dead gift-card stubs (WB-036)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: WB-035 — env-gate the express-pay / Affirm chrome

**Files:**
- Create: `storefront/src/modules/checkout/components/express-pay/config.ts`
- Create: `storefront/src/modules/checkout/components/express-pay/config.test.ts`
- Modify: `storefront/src/modules/checkout/templates/checkout-form/index.tsx` (line ~31)
- Modify: `storefront/src/modules/checkout/templates/checkout-summary/index.tsx` (lines ~183-189)
- Modify: `storefront/.env.local.template`

**Interfaces:**
- Produces: `isExpressPayEnabled(): boolean`, `isAffirmEnabled(): boolean` from `./config`.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/modules/checkout/components/express-pay/config.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest"
import { isExpressPayEnabled, isAffirmEnabled } from "./config"

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
})

describe("checkout provider flags", () => {
  it("isExpressPayEnabled true only for the literal 'true'", () => {
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "true"
    expect(isExpressPayEnabled()).toBe(true)
  })
  it("isExpressPayEnabled false when unset / 'false' / other", () => {
    delete process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED
    expect(isExpressPayEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "false"
    expect(isExpressPayEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED = "1"
    expect(isExpressPayEnabled()).toBe(false)
  })
  it("isAffirmEnabled true only for the literal 'true'", () => {
    process.env.NEXT_PUBLIC_AFFIRM_ENABLED = "true"
    expect(isAffirmEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_AFFIRM_ENABLED = "false"
    expect(isAffirmEnabled()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- express-pay/config`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implement the config helper**

Create `storefront/src/modules/checkout/components/express-pay/config.ts`:

```ts
/**
 * Checkout provider feature flags (WB-035). Default OFF. These enable the UI
 * only — a real provider (Stripe wallets / Affirm) must be wired separately.
 * Deliberately NOT gated on the Stripe key, so enabling Stripe CARD payments
 * does not surface non-functional WALLET buttons.
 */

/** Apple/Google wallet express pay is wired. */
export const isExpressPayEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED === "true"

/** Affirm BNPL messaging is wired. */
export const isAffirmEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_AFFIRM_ENABLED === "true"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && pnpm test:unit -- express-pay/config`
Expected: PASS.

- [ ] **Step 5: Gate the ExpressPay mount**

In `storefront/src/modules/checkout/templates/checkout-form/index.tsx`:
1. Add the import:

```ts
import { isExpressPayEnabled } from "@modules/checkout/components/express-pay/config"
```

2. Replace the unconditional mount (currently line ~31, `<ExpressPay />`) with:

```tsx
      {isExpressPayEnabled() && <ExpressPay />}
```

- [ ] **Step 6: Gate the Affirm line**

In `storefront/src/modules/checkout/templates/checkout-summary/index.tsx`:
1. Add the import:

```ts
import { isAffirmEnabled } from "@modules/checkout/components/express-pay/config"
```

2. Change the Affirm block condition (currently `{total > 0 && (` at line ~183) to also require the flag:

```tsx
        {isAffirmEnabled() && total > 0 && (
          <div
            className="text-right mt-1.5 font-[var(--mono)] text-[11px] tracking-[0.03em] text-[var(--ink-soft)]"
          >
            OR 4× ${Math.round(total / 4).toLocaleString()} WITH AFFIRM
          </div>
        )}
```

- [ ] **Step 7: Document the flags**

Append to `storefront/.env.local.template` (under a clear comment):

```
# Checkout provider UI flags (WB-035) — default OFF. These render the UI ONLY;
# a real provider (Stripe wallets / Affirm) must be wired separately. Leave unset
# (or "false") until the provider integration exists, or non-functional buttons appear.
# NEXT_PUBLIC_EXPRESS_PAY_ENABLED=false
# NEXT_PUBLIC_AFFIRM_ENABLED=false
```

- [ ] **Step 8: Typecheck + full suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors; vitest PASS.

- [ ] **Step 9: Commit**

```bash
git add storefront/src/modules/checkout/components/express-pay/config.ts storefront/src/modules/checkout/components/express-pay/config.test.ts storefront/src/modules/checkout/templates/checkout-form/index.tsx storefront/src/modules/checkout/templates/checkout-summary/index.tsx storefront/.env.local.template
git commit -m "fix(checkout): env-gate non-functional express-pay + Affirm chrome (WB-035)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: WB-033 + WB-047 — checkout redirect + stale-copy cleanup

**Files:**
- Modify: `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx` (redirect)
- Modify: `storefront/src/modules/checkout/components/review/index.tsx` (line ~43-44)
- Modify: `storefront/src/modules/order/templates/order-completed-template.tsx` (remove onboarding block + imports)
- Delete: `storefront/src/modules/order/components/onboarding-cta/` (orphaned component dir)

**Interfaces:** none (presentational / server-component changes). No unit test — verified by tsc, grep, and a documented manual smoke.

- [ ] **Step 1: WB-033 — redirect bare `/checkout` to the address step**

In `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx`:
1. Add the import:

```ts
import { redirect } from "next/navigation"
```

2. Change the component signature + add the redirect at the top of the body. Replace:

```tsx
export default async function Checkout() {
  const cart = await fetchCart()
  const customer = await getCustomer()
```

with:

```tsx
export default async function Checkout({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { countryCode } = await params
  const { step } = await searchParams
  if (!step) {
    redirect(`/${countryCode}/checkout?step=address`)
  }

  const cart = await fetchCart()
  const customer = await getCustomer()
```

(Leave the rest of the component — `fetchCart`, the empty-cart branch, and the render — unchanged.)

- [ ] **Step 2: WB-047 — rebrand the review Privacy Policy copy**

In `storefront/src/modules/checkout/components/review/index.tsx` (lines ~43-44), change:

```
                read Medusa
                Store&apos;s Privacy Policy.
```

to:

```
                read Wheel
                Builds&apos; Privacy Policy.
```

(The sentence becomes "…acknowledge that you have read Wheel Builds' Privacy Policy." Note the apostrophe is `&apos;` with no trailing `s` — "Wheel Builds'" is the correct possessive.)

- [ ] **Step 3: WB-047 — remove the dead onboarding CTA**

In `storefront/src/modules/order/templates/order-completed-template.tsx`:
1. Remove the import line `import OnboardingCta from "@modules/order/components/onboarding-cta"` (line ~12).
2. Remove the import line `import { cookies } from "next/headers"` (line 1) — it is used ONLY for the onboarding check.
3. Remove the `const isOnboarding = cookies().get("_medusa_onboarding")?.value === "true"` line (~line 32).
4. Remove the conditional render block (lines ~40-44):

```tsx
      {isOnboarding && (
        <div className="px-5 small:px-10 pt-6">
          <OnboardingCta orderId={order.id} />
        </div>
      )}
```

- [ ] **Step 4: Delete the orphaned component**

```bash
git rm -r storefront/src/modules/order/components/onboarding-cta
```

- [ ] **Step 5: Verify no stale copy or dangling references remain**

Run:
```bash
cd storefront && grep -rn "Medusa Store\|test order\|onboarding-cta\|OnboardingCta\|_medusa_onboarding" src/modules/order src/modules/checkout src/app
```
Expected: no user-facing "Medusa Store"/"test order" matches and no remaining reference to `OnboardingCta`/`onboarding-cta`/`_medusa_onboarding` outside deleted code. (A code comment mentioning "Medusa-UI" in `section-shell` is fine — it's not user-facing.)

- [ ] **Step 6: Typecheck + full suite + manual-smoke note**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors (note: `order-completed-template.tsx` already has a pre-existing error on `main` — confirm your edit does not ADD one); vitest PASS.

Manual smoke (document, don't fabricate — a live backend is likely unavailable): bare `/<cc>/checkout` redirects to `?step=address`; the order-confirmation page renders with no onboarding CTA; the review step shows "Wheel Builds' Privacy Policy". State clearly if deferred.

- [ ] **Step 7: Commit**

```bash
git add storefront/src/app/"[countryCode]"/"(checkout)"/checkout/page.tsx storefront/src/modules/checkout/components/review/index.tsx storefront/src/modules/order/templates/order-completed-template.tsx
git commit -m "fix(checkout): redirect bare /checkout to address step; drop stale Medusa copy + onboarding CTA (WB-033, WB-047)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(The `git rm` from Step 4 is already staged; it is included in this commit.)

---

### Task 5: WB-053 — lift the Meilisearch browse cap

**Files:**
- Modify: `backend/medusa-config.js` (products `indexSettings`, after `sortableAttributes`)

**Interfaces:** none.

- [ ] **Step 1: Add `pagination.maxTotalHits`**

In `backend/medusa-config.js`, inside the `@rokmohar/medusa-plugin-meilisearch` products `indexSettings` object, add a `pagination` key after `sortableAttributes`. Change:

```js
              sortableAttributes: ['price_min', 'created_at', 'title'],
            },
```

to:

```js
              sortableAttributes: ['price_min', 'created_at', 'title'],
              pagination: { maxTotalHits: 10000 },
            },
```

- [ ] **Step 2: Verify the config still parses**

Run: `cd backend && node --check medusa-config.js`
Expected: no output, exit 0 (syntax valid). Do NOT boot Medusa — the setting only takes effect when the plugin pushes index settings on next deploy/re-sync.

- [ ] **Step 3: Commit**

```bash
git add backend/medusa-config.js
git commit -m "feat(search): raise Meili products maxTotalHits to 10000 so browse passes 1000 (WB-053)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- WB-034 (qty cap) → Task 1. ✓
- WB-036 (discount bug + dead stubs; gift cards deferred to WB-054 filed at closeout) → Task 2. ✓
- WB-035 (env-gate express-pay/Affirm) → Task 3. ✓
- WB-033 (checkout redirect) + WB-047 (stale copy + onboarding CTA) → Task 4. ✓
- WB-053 (Meili cap) → Task 5. ✓
- Out of scope (gift-card v2, real providers, first-incomplete-step) → no task. ✓

**Placeholder scan:** every code step shows full code; no TBD/"handle edge cases"/"similar to Task N". ✓

**Type consistency:** `maxSelectableQty(variant, currentQty)`, `retainedPromoCodes(promotions, removeCode?)`, `isExpressPayEnabled()`/`isAffirmEnabled()`, env flags `NEXT_PUBLIC_EXPRESS_PAY_ENABLED`/`NEXT_PUBLIC_AFFIRM_ENABLED` — consistent across plan + spec. ✓

**Note for the controller:** file the new backlog item **WB-054 · Medusa v2 gift-card apply/remove (backend workflow + storefront UI)** during the doc closeout (not an implementer task).

**Whole-group verification:** `cd storefront && pnpm test:unit` (new max-qty + promo-codes + express-pay/config green; existing 75 pass), `cd storefront && npx tsc --noEmit` (no new errors), `cd backend && node --check medusa-config.js`, grep clean for stale copy, plus the deferred manual checkout smoke.
