# WB-118 · Checkout & Money Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every dollar amount the shopper sees provably equal the amount they are charged, and make US shipping and tax reflect what the site advertises.

**Architecture:** One pure, unit-tested helper (`cartTotalRows`) becomes the single source of the displayed money breakdown for both `/cart` and `/checkout`, replacing two hand-rolled row lists that each read raw Medusa totals fields incorrectly. Address and payment inputs gain the validation they currently lack. Shipping and tax are configuration, delivered as two guarded `medusa exec` scripts rather than application code.

**Tech Stack:** Next.js 15 / React 19 storefront (Vitest), MedusaJS 2.13.6 backend (Jest), Stripe Payment Element, Meilisearch (untouched here).

## ⚠️ Testing constraint — read before writing any test

`storefront/vitest.config.ts` is `test: { include: ["src/**/*.test.ts"], environment: "node" }`.

- **`.test.tsx` files are not collected at all.** There is no DOM environment, and
  `@testing-library/react`, `jsdom` and `happy-dom` are **not installed** — the storefront
  has **121 `.test.ts` files and zero component tests**.
- Therefore: **do not write component-render tests, and do not add a DOM testing stack.**
  That would be an un-asked-for dependency and config change in a wave about money bugs.
- The pattern this plan follows instead — and the reason `cartTotalRows` returns `key` and
  `label` rather than JSX — is: **put every decision in a pure function, test that
  exhaustively, and leave the component as a thin `.map()` over it.** Component correctness
  is then covered by `tsc --noEmit` plus the manual browser check in Task 10.

## Global Constraints

- **Price units:** dollars (major units) in Medusa; integer cents only in the Meilisearch index. Nothing in this wave converts between them — cart/checkout is entirely dollars. Do not introduce a `*100` or `/100` anywhere in this plan's files.
- **No `wb-` prefix** on any component dir, file, export, or CSS class.
- **`MedusaService` update/create take a single object**, not `(selector, update)`. `service.updateX({ id, ...fields })`.
- **Storefront tsc baseline is exactly 2 errors** (`lib/data/onboarding.ts`, `modules/products/components/product-onboarding-cta/index.tsx`). The count must not rise. `next.config.js` ignores type errors at build time, so run `npx tsc --noEmit` yourself.
- **Do not reintroduce un-awaited `getAuthHeaders()`** — it is `async`; spreading it un-awaited silently drops the `Authorization` header.
- **`.medusa/server` is a stale-config trap.** After changing `medusa-config.js` or backend env, `rm -rf backend/.medusa/server` before restarting.
- **`pnpm` may not be on PATH on Windows.** Use `npx -y pnpm@9.10.0 <cmd>`, or `backend/node_modules/.bin/medusa.CMD` directly.
- **Two separate installs.** There is no root `package.json`; `cd` into `backend/` or `storefront/` before running anything.
- **Stripe test mode only.** No real card data at any point in this wave.
- **Commit after every task.** Branch is `feat/g13-qa-remediation` (already created).

## Reference: Medusa 2.13.6 cart totals (read this before Task 3)

From `backend/node_modules/.pnpm/@medusajs+utils@2.13.6*/node_modules/@medusajs/utils/dist/totals/cart/index.js`, function `decorateCartTotals`:

```js
subtotal = Σ item.subtotal + Σ shippingMethod.subtotal        // lines 66 AND 87
taxTotal = itemsTaxTotal + shippingTaxTotal                   // line 106
total    = (subtotal + taxTotal) − discountSubtotal − creditLinesTotal   // lines 111-112
shipping_total = Σ shippingMethod.total                       // line 92 (tax INCLUDED)
```

The load-bearing fact: **`cart.subtotal` already includes the shipping subtotal.** Adding a
`shipping_total` row on top of `subtotal` double-counts shipping, and `shipping_total`
carries shipping tax which `tax_total` also carries. This is why the displayed rows don't
add up.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `storefront/src/lib/util/__fixtures__/cart-payment-step.json` | **Create.** Real captured `StoreCart` at the payment step. | 1 |
| `docs/in-progress/plans/wb-118-task1-findings.md` | **Create.** Which field reads `$0.00`; later, the live verification record. | 1, 10 |
| `storefront/src/lib/util/cart-total-rows.ts` | **Create.** Pure: cart-like → ordered display rows + total. The only place money-row semantics live. | 2 |
| `storefront/src/lib/util/cart-total-rows.test.ts` | **Create.** Invariant + table tests, incl. the real fixture. | 2, 5 |
| `storefront/src/modules/common/components/cart-totals/index.tsx` | **Modify.** Thin `.map()` over `cartTotalRows`. | 3 |
| `storefront/src/modules/checkout/templates/checkout-summary/index.tsx` | **Modify.** `Totals` + `Row` only. | 4 |
| `storefront/src/lib/util/line-item-amounts.ts` + `.test.ts` | **Modify / create.** Only if Task 1 lands on Branch A. | 5 |
| `storefront/src/lib/util/us-states.ts` | **Create.** `US_STATES` (51) + `normalizeUsState`. | 6 |
| `storefront/src/lib/util/us-states.test.ts` | **Create.** | 6 |
| `storefront/src/modules/checkout/components/state-select/index.tsx` | **Create.** Mirrors `country-select`. | 6 |
| `storefront/src/modules/checkout/components/shipping-address/index.tsx` | **Modify.** Province free-text → select for US. | 6 |
| `storefront/src/modules/checkout/components/billing_address/index.tsx` | **Modify.** Same. | 6 |
| the Stripe element mount (located in Task 7 Step 1) | **Modify.** Enable postal-code collection. | 7 |
| `backend/src/lib/state-rates.ts` | **Create.** Pure `parseStateRates` — split out so it tests without a DB. | 8 |
| `backend/src/lib/__tests__/state-rates.test.ts` | **Create.** | 8 |
| `backend/src/scripts/create-us-state-tax-rates.ts` | **Create.** Province tax regions from `--rates=IL:10.25,CA:7.25`. | 8 |
| `storefront/src/lib/util/shipping-threshold.ts` + `.test.ts` | **Create.** One `$199`, twinned with the backend script. | 9 |
| `backend/src/scripts/update-shipping-prices.ts` | **Modify.** Reciprocal lockstep comment only. | 9 |
| `docs/reference/go-live-runbook.md` | **Modify.** The two ops steps. | 11 |
| `docs/future/BACKLOG.md`, `docs/STATUS.md` | **Modify.** Close out WB-118. | 11 |

---

## Task 1: Capture a real cart payload (NO production code)

**Why first:** Q-01's obvious explanation is provably wrong (see the spec). We do not know
which dollar field renders `$0.00`. Everything else in this wave is safer once we have a
real payload.

**Files:**
- Create: `storefront/src/lib/util/__fixtures__/cart-payment-step.json`
- Create: `docs/in-progress/plans/wb-118-task1-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `cart-payment-step.json` — a real `HttpTypes.StoreCart` with at least two line
  items (quantity > 1 on one), a selected shipping method, a US shipping address, and every
  totals field. Tasks 2–5 import it.

- [ ] **Step 1: Start the stack (or use production read-only)**

Preferred — local:
```bash
cd backend && npx -y pnpm@9.10.0 dev
# separate terminal
cd storefront && npx -y pnpm@9.10.0 dev
```
If no local database is available, use the live site
`https://storefront-production-0088.up.railway.app` instead. **Stop at the payment step —
do not submit payment.** An abandoned cart is the only side effect.

- [ ] **Step 2: Drive the cart to the payment step**

In the browser: add a wheel (quantity 4) and a tire (quantity 1) → `/us/cart` → checkout →
US address (use `Chicago`, `IL`, `60601`) → select a shipping method → stop at payment.

Shipping must be **non-zero** — with free shipping the Q-02 double-count is invisible.

- [ ] **Step 3: Record which field reads `$0.00`**

Screenshot `/us/cart` and `/us/checkout`. In `wb-118-task1-findings.md` write, literally:

```
Q-01 field that renders $0.00: <component + row label + screenshot filename>
Q-01 raw value of that field in the payload: <verbatim JSON value>
Q-02 displayed rows: subtotal=<> discount=<> shipping=<> tax=<> total=<>
Q-02 sum of rows as displayed: <>   cart.total: <>   difference: <>
```

If **no** field reads `$0.00`, write `NOT REPRODUCED` and say so in the task report — do
not invent a fix for a bug that isn't there.

- [ ] **Step 4: Capture the payload**

DevTools → Network → the `GET /store/carts/<id>` response → Copy response → save to
`storefront/src/lib/util/__fixtures__/cart-payment-step.json`.

Then redact: replace `email`, `shipping_address.first_name`, `.last_name`, `.phone`,
`.address_1` with literals `"qa@example.com"`, `"QA"`, `"Tester"`, `"+15555550100"`,
`"1 Test St"`. Keep `city`, `province`, `postal_code`, `country_code` — Task 5 and the tax
verification need them. Keep every numeric field byte-exact.

- [ ] **Step 5: Sanity-check the fixture**

```bash
cd storefront
node -e "const c=require('./src/lib/util/__fixtures__/cart-payment-step.json');console.log({items:c.items?.length,qty:c.items?.map(i=>i.quantity),shipping:c.shipping_total,shipping_subtotal:c.shipping_subtotal,subtotal:c.subtotal,item_subtotal:c.item_subtotal,tax:c.tax_total,discount_subtotal:c.discount_subtotal,total:c.total})"
```
Expected: `items >= 2`, at least one `quantity > 1`, `shipping_total > 0`, all totals fields present.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/lib/util/__fixtures__/cart-payment-step.json docs/in-progress/plans/wb-118-task1-findings.md
git commit -m "test(WB-118): capture a real cart payload at the payment step

Reproduce-first fixture for Wave 1. Records which dollar field renders
\$0.00 (Q-01) and the displayed-rows-vs-total gap (Q-02). PII redacted;
all numeric fields byte-exact."
```

---

## Task 2: `cartTotalRows` — the pure totals helper

**Files:**
- Create: `storefront/src/lib/util/cart-total-rows.ts`
- Test: `storefront/src/lib/util/cart-total-rows.test.ts`

**Interfaces:**
- Consumes: `cart-payment-step.json` from Task 1.
- Produces:
  ```ts
  export type CartTotalRow = { key: string; label: string; amount: number; negative?: boolean }
  export type CartTotalsView = { rows: CartTotalRow[]; total: number; currencyCode: string }
  export type CartLikeTotals = { /* see implementation */ }
  export function cartTotalRows(cart: CartLikeTotals): CartTotalsView
  ```
  Task 3 imports `cartTotalRows` and `CartLikeTotals`; Task 4 imports `cartTotalRows`.

`storefront/tsconfig.json` already has `resolveJsonModule: true`, so importing the fixture
directly typechecks. (The repo's other fixtures use `readFileSync` only because they live
outside the app root, in `../../fixtures/` — that does not apply here.)

**If Task 1 could not produce a fixture** (no local database and the live cart page blocked),
keep the six synthetic tests, replace the real-cart test with `it.todo("INVARIANT: rows sum
to total on the real captured cart")`, and say so explicitly in the task report. Do **not**
delete the case silently — the whole point of this wave is that a synthetic-only proof is
what let these bugs reach production.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/lib/util/cart-total-rows.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { cartTotalRows } from "./cart-total-rows"
import realCart from "./__fixtures__/cart-payment-step.json"

const base = {
  currency_code: "usd",
  item_subtotal: 1000,
  shipping_subtotal: 0,
  tax_total: 0,
  discount_subtotal: 0,
  credit_line_total: 0,
  total: 1000,
}

const sum = (v: ReturnType<typeof cartTotalRows>) =>
  v.rows.reduce((acc, r) => acc + (r.negative ? -r.amount : r.amount), 0)

describe("cartTotalRows", () => {
  it("rows sum to cart.total for an items-only cart", () => {
    const view = cartTotalRows(base)
    expect(sum(view)).toBeCloseTo(view.total, 2)
    expect(view.total).toBe(1000)
  })

  it("does NOT double-count shipping (the Q-02 regression)", () => {
    // Medusa: subtotal already contains shipping_subtotal, and tax_total
    // already contains shipping tax. total = subtotal + tax - discount.
    const cart = {
      ...base,
      item_subtotal: 1000,
      shipping_subtotal: 11,
      shipping_total: 12, // includes $1 shipping tax
      tax_total: 1,
      total: 1012, // (1000 + 11) + 1
    }
    const view = cartTotalRows(cart)
    expect(sum(view)).toBeCloseTo(1012, 2)
    // The old code rendered subtotal(1011) + shipping_total(12) + tax(1) = 1024
    expect(sum(view)).not.toBeCloseTo(1024, 2)
  })

  it("subtracts discount_subtotal, not discount_total", () => {
    const cart = {
      ...base,
      item_subtotal: 1000,
      tax_total: 90,
      discount_subtotal: 100,
      discount_total: 110, // subtotal + its tax — must NOT be the row used
      total: 990, // (1000 + 90) - 100
    }
    const view = cartTotalRows(cart)
    expect(sum(view)).toBeCloseTo(990, 2)
    expect(view.rows.find((r) => r.key === "discount")?.amount).toBe(100)
  })

  it("omits zero-value optional rows but always keeps items and tax", () => {
    const view = cartTotalRows(base)
    expect(view.rows.map((r) => r.key)).toEqual(["items", "tax"])
  })

  it("shows a credit row only when non-zero", () => {
    const cart = { ...base, credit_line_total: 50, total: 950 }
    const view = cartTotalRows(cart)
    expect(view.rows.find((r) => r.key === "credit")?.amount).toBe(50)
    expect(sum(view)).toBeCloseTo(950, 2)
  })

  it("treats missing numeric fields as 0 rather than NaN", () => {
    const view = cartTotalRows({ currency_code: "usd", total: 0 } as any)
    expect(Number.isNaN(sum(view))).toBe(false)
    expect(view.rows.every((r) => Number.isFinite(r.amount))).toBe(true)
  })

  it("INVARIANT: rows sum to total on the real captured cart", () => {
    const view = cartTotalRows(realCart as any)
    expect(sum(view)).toBeCloseTo(view.total, 2)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd storefront && npx vitest run src/lib/util/cart-total-rows.test.ts
```
Expected: FAIL — `Failed to resolve import "./cart-total-rows"`.

- [ ] **Step 3: Write the implementation**

Create `storefront/src/lib/util/cart-total-rows.ts`:

```ts
/**
 * The single source of truth for the money breakdown shown on /cart and
 * /checkout (WB-118 Q-02).
 *
 * Derived from @medusajs/utils 2.13.6 `decorateCartTotals`:
 *
 *   subtotal = Σ item.subtotal + Σ shippingMethod.subtotal   (shipping INCLUDED)
 *   taxTotal = itemsTaxTotal + shippingTaxTotal
 *   total    = (subtotal + taxTotal) − discountSubtotal − creditLinesTotal
 *
 * Both surfaces used to render `subtotal − discount_total + shipping_total +
 * tax_total`, which counted shipping twice (its subtotal is already inside
 * `subtotal`; its tax is already inside `tax_total`), subtracted the wrong
 * discount field, and never showed credit lines.
 *
 * We rebuild `subtotal` from its two halves instead, so the rows sum to
 * `cart.total` by construction:
 *
 *   item_subtotal + shipping_subtotal + tax_total
 *     − discount_subtotal − credit_line_total  ===  total
 *
 * `total` is ALWAYS `cart.total` verbatim — the charged amount — never a
 * client-side re-computation. The rows explain that number; they do not
 * define it.
 */

export type CartTotalRow = {
  key: string
  label: string
  amount: number
  /** Rendered as a subtraction. `amount` stays positive. */
  negative?: boolean
}

export type CartTotalsView = {
  rows: CartTotalRow[]
  total: number
  currencyCode: string
}

export type CartLikeTotals = {
  currency_code?: string | null
  item_subtotal?: number | null
  shipping_subtotal?: number | null
  tax_total?: number | null
  discount_subtotal?: number | null
  credit_line_total?: number | null
  total?: number | null
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

export function cartTotalRows(cart: CartLikeTotals): CartTotalsView {
  const items = num(cart.item_subtotal)
  const shipping = num(cart.shipping_subtotal)
  const tax = num(cart.tax_total)
  const discount = num(cart.discount_subtotal)
  const credit = num(cart.credit_line_total)

  const rows: CartTotalRow[] = [{ key: "items", label: "Items", amount: items }]

  // Omitted entirely until a shipping method is chosen — "Shipping $0.00"
  // before that step reads as a promise of free shipping.
  if (shipping !== 0) {
    rows.push({ key: "shipping", label: "Shipping", amount: shipping })
  }
  if (discount !== 0) {
    rows.push({ key: "discount", label: "Discount", amount: discount, negative: true })
  }

  rows.push({ key: "tax", label: "Tax", amount: tax })

  if (credit !== 0) {
    rows.push({ key: "credit", label: "Credit", amount: credit, negative: true })
  }

  return {
    rows,
    total: num(cart.total),
    currencyCode: cart.currency_code || "usd",
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd storefront && npx vitest run src/lib/util/cart-total-rows.test.ts
```
Expected: PASS, 7 tests.

If the **real-cart invariant test fails**, that is a genuine finding, not a broken test.
Record the exact residual in `wb-118-task1-findings.md` and stop — an unexplained gap
between the rows and the charged total is the whole bug, and it must be understood, not
papered over with a fudge row.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/lib/util/cart-total-rows.ts storefront/src/lib/util/cart-total-rows.test.ts
git commit -m "feat(WB-118): cartTotalRows — one money breakdown that sums to cart.total

Medusa's cart.subtotal already contains shipping_subtotal, so rendering a
separate shipping row on top double-counted it; the discount row also used
discount_total where the real formula uses discount_subtotal. Rebuild the
breakdown from item_subtotal + shipping_subtotal so the rows reconcile with
the charged total by construction. Q-02."
```

---

## Task 3: Point `/cart` at `cartTotalRows`

**Files:**
- Modify: `storefront/src/modules/common/components/cart-totals/index.tsx` (whole file)

**No new test file.** Every decision this component makes now lives in `cartTotalRows`,
which Task 2 tested exhaustively. See the testing constraint above.

**Interfaces:**
- Consumes: `cartTotalRows`, `CartLikeTotals` from Task 2.
- Produces: nothing new. `CartTotals`'s prop stays `{ totals: <cart-like> }` so
  `modules/cart/templates/summary.tsx` needs no change.

- [ ] **Step 1: Confirm Task 2's tests still pass before touching the component**

```bash
cd storefront && npx vitest run src/lib/util/cart-total-rows.test.ts
```
Expected: PASS, 7 tests. This is the safety net for the rewrite below.

- [ ] **Step 2: Rewrite the component**

Replace the whole body of `storefront/src/modules/common/components/cart-totals/index.tsx`:

```tsx
"use client"

import { convertToLocale } from "@lib/util/money"
import { cartTotalRows, type CartLikeTotals } from "@lib/util/cart-total-rows"
import React from "react"

type CartTotalsProps = {
  /**
   * Any cart-like object carrying Medusa's totals fields. Kept loose so both
   * `StoreCart` and `StoreOrder` work — the shape `cartTotalRows` needs is a
   * subset of both.
   */
  totals: CartLikeTotals
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals }) => {
  const { rows, total, currencyCode } = cartTotalRows(totals)

  return (
    <div>
      <div className="flex flex-col gap-y-2 txt-medium text-ui-fg-subtle">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between">
            <span className="flex gap-x-1 items-center">{row.label}</span>
            <span
              className={row.negative ? "text-ui-fg-interactive" : undefined}
              data-testid={`cart-${row.key}`}
              data-value={row.amount}
            >
              {row.negative ? "- " : ""}
              {convertToLocale({ amount: row.amount, currency_code: currencyCode })}
            </span>
          </div>
        ))}
      </div>
      <div className="h-px w-full border-b border-gray-200 my-4" />
      <div className="flex items-center justify-between text-ui-fg-base mb-2 txt-medium">
        <span>Total</span>
        <span className="txt-xlarge-plus" data-testid="cart-total" data-value={total}>
          {convertToLocale({ amount: total, currency_code: currencyCode })}
        </span>
      </div>
      <div className="h-px w-full border-b border-gray-200 mt-4" />
    </div>
  )
}

export default CartTotals
```

Note: the old `data-testid="cart-subtotal"` becomes `cart-items`, and `cart-taxes`
becomes `cart-tax`, because the ids are now derived from the row keys.

- [ ] **Step 3: Find and update any other consumer of the old test ids**

```bash
cd storefront && grep -rn "cart-subtotal\|cart-taxes\|cart-gift-card-amount\|cart-discount" src e2e --include=*.ts --include=*.tsx
```
Update every hit to the new ids (`cart-items`, `cart-tax`; `cart-discount` is unchanged).
If `e2e/` references them, update there too — Playwright is not run by this wave's gate but
must not be left knowingly broken.

- [ ] **Step 4: Verify types and the whole suite**

```bash
cd storefront && npx tsc --noEmit && npx vitest run
```
Expected: tsc reports exactly **2** errors (the documented baseline); all tests PASS.

`gift_card_total` is no longer rendered — `decorateCartTotals` has gift-card handling
commented out in 2.13.6 (`// cart.gift_card_total = ...`), so the old row could only ever
show `undefined ?? 0`. Dropping it removes a row that was structurally incapable of being
non-zero. If gift cards land later (WB-054), add the row to `cartTotalRows` where it will
be covered by the invariant test.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/common/components/cart-totals storefront/src/lib/util/cart-total-rows.ts
git commit -m "fix(WB-118): /cart totals render from cartTotalRows

Drops the factually-wrong 'Subtotal (excl. shipping and taxes)' label --
Medusa's subtotal excludes taxes but INCLUDES shipping -- and stops adding
shipping_total on top of a subtotal that already contains it. Q-02."
```

---

## Task 4: Point `/checkout` at `cartTotalRows`

**Files:**
- Modify: `storefront/src/modules/checkout/templates/checkout-summary/index.tsx` — the
  `Totals` and `Row` components only. Leave `CheckoutSummary` and `LineItemRow` alone.

**No new test file** (see the testing constraint). This task's correctness claim is
"checkout renders the same rows as `/cart`", and it is guaranteed structurally by both
calling `cartTotalRows` — not by a duplicated assertion.

**Interfaces:**
- Consumes: `cartTotalRows` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Replace the `Totals` component**

In `storefront/src/modules/checkout/templates/checkout-summary/index.tsx`, replace the
entire `Totals` component (and leave `Row` in place — it is reused) with:

```tsx
const Totals = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const { rows, total, currencyCode } = cartTotalRows(cart as any)

  return (
    <div className="pt-2 pb-5" style={{ borderTop: "1px solid var(--hairline)" }}>
      {rows.map((row) => (
        <Row
          key={row.key}
          testId={`checkout-${row.key}`}
          label={row.label}
          value={`${row.negative ? "− " : ""}${convertToLocale({
            amount: row.amount,
            currency_code: currencyCode,
          })}`}
          accent={row.negative}
        />
      ))}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--ink)" }}>
        <div className="flex justify-between items-baseline">
          <span className="text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
            TOTAL
          </span>
          <span
            className="font-[var(--display)] text-[28px] text-[var(--ink)]"
            style={{ fontWeight: 900 }}
            data-testid="checkout-total"
          >
            <span style={{ color: "var(--orange)" }}>$</span>
            {total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        {isAffirmEnabled() && total > 0 && (
          <div className="text-right mt-1.5 font-[var(--mono)] text-[11px] tracking-[0.03em] text-[var(--ink-soft)]">
            OR 4× $
            {(total / 4).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            WITH AFFIRM
          </div>
        )}
      </div>
    </div>
  )
}
```

Then add `testId` to `Row`:

```tsx
const Row = ({
  label,
  value,
  accent,
  testId,
}: {
  label: string
  value: string
  accent?: boolean
  testId?: string
}) => (
  <div className="flex justify-between items-baseline py-1.5">
    <span className="text-[13px] text-[var(--graphite)]">{label}</span>
    <span
      className="text-[14px] font-medium"
      style={{ color: accent ? "var(--orange-deep)" : "var(--ink)" }}
      data-testid={testId}
    >
      {value}
    </span>
  </div>
)
```

And add the import at the top of the file:

```tsx
import { cartTotalRows } from "@lib/util/cart-total-rows"
```

Note the old `Totals` hard-coded `shipping === 0 ? "FREE"`. That is now handled by
`cartTotalRows` omitting the row entirely when there is no shipping subtotal — which is
more honest, because the old version rendered "FREE" *before a shipping method was even
selected*, promising something not yet determined.

If you want "FREE" back once a method IS selected and costs nothing, that belongs in
`cartTotalRows` (add a `free?: boolean` to `CartTotalRow` and cover it in the Task 2 test),
not as a special case in this component.

- [ ] **Step 2: Verify types and the whole suite**

```bash
cd storefront && npx tsc --noEmit && npx vitest run
```
Expected: tsc exactly **2** errors; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/checkout/templates/checkout-summary
git commit -m "fix(WB-118): checkout summary totals render from cartTotalRows

/cart and /checkout now derive their money rows from one helper, so they
cannot disagree with each other or with the charged total. Q-02."
```

---

## Task 5: Q-01 — fix whichever field renders $0.00

**⚠️ Read `docs/in-progress/plans/wb-118-task1-findings.md` before starting.** If Task 1
recorded `NOT REPRODUCED`, skip this task entirely and say so in the task report.

**Files:**
- Modify: whichever file Task 1 named. Most likely one of:
  - `storefront/src/lib/util/line-item-amounts.ts`
  - `storefront/src/modules/common/components/line-item-unit-price/index.tsx`
  - `storefront/src/modules/layout/components/cart-dropdown/index.tsx`
- Test: a `.test.ts` beside whichever file changes.

**Interfaces:**
- Consumes: `cart-payment-step.json` (Task 1), `cartTotalRows` (Task 2 — if the zero turns
  out to be a totals row, Tasks 3 and 4 may already have fixed it; verify before writing
  new code).
- Produces: nothing new.

- [ ] **Step 1: Re-check whether Tasks 3–4 already fixed it**

If Task 1 named a **cart-page totals row**, re-run the Task 1 browser repro against the
local branch. `CartTotals` previously defaulted every field with `?? 0`, so a missing field
rendered `$0.00`; the Task 3 rewrite reads a different field set and may already resolve
it. If it does, write that in the task report, add a regression test (Step 3) covering the
field being absent, and skip Step 4.

- [ ] **Step 2: Write the failing test for the branch Task 1 identified**

Both candidate branches are written out in full below. Use the one that matches Task 1's
finding; delete the other. Do **not** write both.

**Branch A — the zero is a line-item unit price.** Create
`storefront/src/lib/util/line-item-amounts.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { lineItemAmounts } from "./line-item-amounts"

describe("lineItemAmounts", () => {
  it("returns a genuine zero for a genuinely free line", () => {
    expect(lineItemAmounts({ total: 0, quantity: 1, unit_price: 0 })).toEqual({
      total: 0,
      unitPrice: 0,
    })
  })

  it("derives the unit price when the field is absent", () => {
    expect(lineItemAmounts({ total: 980, quantity: 4 })).toEqual({
      total: 980,
      unitPrice: 245,
    })
  })

  it("derives the unit price when it contradicts a positive total", () => {
    // A stored unit_price of 0 beside a positive total is not a legitimate
    // state -- Medusa derives total FROM unit_price, so they cannot honestly
    // disagree. Prefer the total, which is the amount actually charged.
    expect(lineItemAmounts({ total: 980, quantity: 4, unit_price: 0 })).toEqual({
      total: 980,
      unitPrice: 245,
    })
  })
})
```

Then the fix in `storefront/src/lib/util/line-item-amounts.ts`:

```ts
  const quantity = item.quantity ?? 0
  const total = item.total ?? 0
  const derived = quantity > 0 ? total / quantity : 0
  // `??` alone is not enough: a unit_price of 0 beside a positive total is a
  // contradiction, not a free item. Prefer the charged total in that case,
  // and fall back to it when unit_price is missing entirely.
  const unitPrice = item.unit_price || derived
```

**Branch B — the zero is a totals row rendering a missing field.** Add to
`storefront/src/lib/util/cart-total-rows.test.ts`:

```ts
  it("omits a row whose field is missing rather than rendering $0.00", () => {
    // CartTotals used to default every field with `?? 0`, so a field absent
    // from the response rendered "$0.00" beside correct neighbours.
    const view = cartTotalRows({
      currency_code: "usd",
      item_subtotal: 1000,
      tax_total: 0,
      total: 1000,
    } as any)
    expect(view.rows.find((r) => r.key === "shipping")).toBeUndefined()
    expect(view.rows.find((r) => r.key === "items")?.amount).toBe(1000)
  })
```

Task 2's implementation already satisfies Branch B (optional rows are omitted, not
zero-filled), so if Task 1 pointed here the work is a regression test plus confirming the
repro is gone — not a new fix.

- [ ] **Step 3: Run it to verify it fails (Branch A) or passes (Branch B)**

```bash
cd storefront && npx vitest run src/lib/util/line-item-amounts.test.ts src/lib/util/cart-total-rows.test.ts
```
Branch A expected: FAIL on the contradiction case.
Branch B expected: PASS — record in the task report that Tasks 3–4 already resolved it.

- [ ] **Step 4: Apply the fix (Branch A only)**

Constrained by the `lineItemAmounts` docstring, which is a deliberate WB-092 decision: the
displayed amount must come from **stored** amounts (`item.total` / `item.unit_price`), never
from the live variant price — a discontinued variant has no resolvable live price and used
to render `NaN`. Deriving from `item.total` is still a stored amount and is allowed;
reaching for `getPricesForVariant` is not.

**If Task 1 identified a third location** not covered by either branch, stop and report it
rather than forcing it into one of these shapes.

- [ ] **Step 5: Run the full storefront suite**

```bash
cd storefront && npx vitest run && npx tsc --noEmit
```
Expected: all tests PASS; tsc reports exactly **2** errors (the documented baseline).

- [ ] **Step 6: Commit**

```bash
git add storefront/src
git commit -m "fix(WB-118): <field> no longer renders \$0.00 beside a correct total

Root cause from the Task 1 capture: <one line>. Q-01."
```

---

## Task 6: US state validation on address forms

**Files:**
- Create: `storefront/src/lib/util/us-states.ts`
- Test: `storefront/src/lib/util/us-states.test.ts`
- Modify: `storefront/src/modules/checkout/components/shipping-address/index.tsx`
- Modify: `storefront/src/modules/checkout/components/billing_address/index.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type UsState = { code: string; name: string }
  export const US_STATES: UsState[]                       // 50 states + DC, 51 entries
  export function normalizeUsState(input: string): string | null   // "Illinois"|"il" -> "IL"; "Chicago" -> null
  ```

- [ ] **Step 1: Write the failing test**

Create `storefront/src/lib/util/us-states.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { US_STATES, normalizeUsState } from "./us-states"

describe("normalizeUsState", () => {
  it("has 50 states plus DC", () => {
    expect(US_STATES).toHaveLength(51)
  })

  it("accepts a two-letter code in any case", () => {
    expect(normalizeUsState("il")).toBe("IL")
    expect(normalizeUsState("IL")).toBe("IL")
  })

  it("accepts a full state name", () => {
    expect(normalizeUsState("Illinois")).toBe("IL")
    expect(normalizeUsState("  california ")).toBe("CA")
  })

  it("rejects a city (the reported bug)", () => {
    expect(normalizeUsState("Chicago")).toBeNull()
    expect(normalizeUsState("Los Angeles")).toBeNull()
  })

  it("rejects empty and junk input", () => {
    expect(normalizeUsState("")).toBeNull()
    expect(normalizeUsState("ZZ")).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd storefront && npx vitest run src/lib/util/us-states.test.ts
```
Expected: FAIL — `Failed to resolve import "./us-states"`.

- [ ] **Step 3: Write the implementation**

Create `storefront/src/lib/util/us-states.ts`:

```ts
/**
 * US state reference + input normaliser (WB-118 Q-07).
 *
 * The province field was free text, so "Chicago" in the state box passed
 * validation, reached the tax lookup and the carrier, and produced the wrong
 * tax and an undeliverable label with no error anywhere. Medusa stores
 * `province` as a plain string, so the constraint has to live here.
 */

export type UsState = { code: string; name: string }

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
]

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s.code]))
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]))

/** `"Illinois"` / `"il"` -> `"IL"`. Anything else (a city, junk, empty) -> `null`. */
export function normalizeUsState(input: string): string | null {
  const trimmed = (input ?? "").trim()
  if (!trimmed) return null
  return BY_CODE.get(trimmed.toUpperCase()) ?? BY_NAME.get(trimmed.toLowerCase()) ?? null
}
```

- [ ] **Step 4: Run the test**

```bash
cd storefront && npx vitest run src/lib/util/us-states.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Create the `StateSelect` component**

Create `storefront/src/modules/checkout/components/state-select/index.tsx`, mirroring the
sibling `country-select/index.tsx` exactly (same `forwardRef` + `NativeSelect` shape, so it
inherits the floating-label chrome and sits correctly in the two-column grid):

```tsx
import { forwardRef, useImperativeHandle, useRef } from "react"

import NativeSelect, {
  NativeSelectProps,
} from "@modules/common/components/native-select"

import { US_STATES } from "@lib/util/us-states"

/**
 * US state picker (WB-118 Q-07). Mirrors CountrySelect so it inherits the same
 * NativeSelect chrome as the country field beside it.
 *
 * Only rendered for US addresses -- the caller falls back to a free-text Input
 * for every other country, because a non-US address must not be constrained to
 * US states.
 */
const StateSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ placeholder = "State", defaultValue, ...props }, ref) => {
    const innerRef = useRef<HTMLSelectElement>(null)

    useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
      ref,
      () => innerRef.current
    )

    return (
      <NativeSelect
        ref={innerRef}
        placeholder={placeholder}
        defaultValue={defaultValue}
        {...props}
      >
        {US_STATES.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </NativeSelect>
    )
  }
)

StateSelect.displayName = "StateSelect"

export default StateSelect
```

- [ ] **Step 6: Swap the province field in the shipping address form**

In `storefront/src/modules/checkout/components/shipping-address/index.tsx`, replace the
province `<Input>` at **lines 174-182**:

```tsx
        <Input
          label="State / Province"
          name="shipping_address.province"
          autoComplete="address-level1"
          value={formData["shipping_address.province"]}
          onChange={handleChange}
          required
          data-testid="shipping-province-input"
        />
```

with:

```tsx
        {formData["shipping_address.country_code"]?.toLowerCase() === "us" ? (
          <StateSelect
            name="shipping_address.province"
            autoComplete="address-level1"
            value={formData["shipping_address.province"]}
            onChange={handleChange}
            required
            data-testid="shipping-province-select"
          />
        ) : (
          <Input
            label="State / Province"
            name="shipping_address.province"
            autoComplete="address-level1"
            value={formData["shipping_address.province"]}
            onChange={handleChange}
            required
            data-testid="shipping-province-input"
          />
        )}
```

and add the import beside the existing `CountrySelect` import:

```tsx
import StateSelect from "@modules/checkout/components/state-select"
```

`handleChange` already accepts `HTMLSelectElement` (line 76), so no handler change is needed.

This file has a pre-existing eslint warning. Leave it — do not "fix" it as part of this work.

- [ ] **Step 7: Repeat for the billing address**

Apply the same conditional in
`storefront/src/modules/checkout/components/billing_address/index.tsx`, using the
`billing_address.` key prefix and `data-testid="billing-province-select"` /
`"billing-address-province-input"` (match whatever test id that file already uses for the
input — read it first, do not assume).

Repeated rather than abstracted: the two files have diverged prop shapes, and unifying them
is a bigger refactor than this wave wants.

- [ ] **Step 8: Normalise a legacy free-text province on submit**

A returning customer may have a saved address whose `province` is `"Illinois"` or
`"Chicago"`. With a `<select>`, a value not in the option list renders as blank and would
silently submit empty.

In the same file, where `setFormAddress` maps a saved address (line 52), pass US provinces
through the normaliser:

```tsx
        "shipping_address.province":
          (address?.country_code?.toLowerCase() === "us"
            ? normalizeUsState(address?.province || "")
            : address?.province) || "",
```

with `import { normalizeUsState } from "@lib/util/us-states"`. `"Illinois"` becomes `"IL"`
and selects correctly; `"Chicago"` becomes `null` → `""`, so the shopper is forced to pick a
real state rather than silently carrying junk into the tax lookup.

- [ ] **Step 9: Verify the build and types**

```bash
cd storefront && npx tsc --noEmit && npx vitest run && npx next build
```
Expected: tsc exactly **2** errors (baseline); all tests PASS; `next build` exit 0.

`next build` matters here specifically: these are `"use client"` files inside the checkout
route group, and a build-only error class has bitten this repo before (WB-093 — a `"use server"`
module exporting a non-async value; neither vitest nor tsc could see it).

- [ ] **Step 10: Commit**

```bash
git add storefront/src/lib/util/us-states.ts storefront/src/lib/util/us-states.test.ts storefront/src/modules/checkout/components
git commit -m "fix(WB-118): constrain the US state field to a real state

'Chicago' in the province box used to pass silently, then drive the tax
lookup and the shipping label. Q-07."
```

---

## Task 7: Collect a postal code on the card form

**Files:**
- Modify: the Stripe Payment Element mount found in Step 1 below.
- Test: manual, in Stripe test mode. No unit test — this is Stripe SDK configuration, and a
  mocked assertion would test the mock.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Locate the Stripe element**

```bash
cd storefront && grep -rn "PaymentElement\|CardElement\|useStripe\|Elements" src/modules/checkout --include=*.tsx
```

- [ ] **Step 2: Read how it is currently configured**

Read the file. If it is `CardElement`, note whether `hidePostalCode: true` is set — that is
the likeliest cause. If it is `PaymentElement`, the postal code comes from the `fields`
option and the billing-address wiring.

- [ ] **Step 3: Enable postal-code collection**

For `CardElement`: remove `hidePostalCode: true` (or set it `false`).

For `PaymentElement`: pass the billing details explicitly so AVS has a value —

```tsx
<PaymentElement
  options={{
    fields: { billingDetails: { address: { postalCode: "auto" } } },
  }}
/>
```

Prefer whichever requires the smaller change; both satisfy the requirement.

- [ ] **Step 4: Verify in Stripe test mode**

Run the checkout to the payment step. Confirm a ZIP field is present and required. Pay with
test card `4242 4242 4242 4242`, any future expiry, CVC `123`, ZIP `60601`. Confirm the
order completes. Then confirm the Stripe dashboard shows a **postal code check** result on
the charge.

**Test mode only.** Never enter a real card.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/checkout
git commit -m "fix(WB-118): collect a postal code on the card form

AVS postal-code checks are a primary card-fraud control and some issuers
decline without one. Q-08."
```

---

## Task 8: Per-state US tax script

**Files:**
- Create: `backend/src/lib/state-rates.ts` (pure parser — separated so it tests without a DB)
- Test: `backend/src/lib/__tests__/state-rates.test.ts`
- Create: `backend/src/scripts/create-us-state-tax-rates.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type StateRate = { state: string; rate: number }
  export function parseStateRates(raw: string): StateRate[]   // throws on malformed input
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/lib/__tests__/state-rates.test.ts`:

```ts
import { parseStateRates } from "../state-rates"

describe("parseStateRates", () => {
  it("parses a comma-separated list", () => {
    expect(parseStateRates("IL:10.25,CA:7.25")).toEqual([
      { state: "IL", rate: 10.25 },
      { state: "CA", rate: 7.25 },
    ])
  })

  it("uppercases the state and tolerates whitespace", () => {
    expect(parseStateRates(" il : 10.25 ")).toEqual([{ state: "IL", rate: 10.25 }])
  })

  it("throws on a malformed pair rather than silently skipping it", () => {
    // Silently dropping a pair would under-collect tax in that state with no signal.
    expect(() => parseStateRates("IL:10.25,CAA")).toThrow(/CAA/)
  })

  it("throws on a non-numeric or out-of-range rate", () => {
    expect(() => parseStateRates("IL:abc")).toThrow(/IL/)
    expect(() => parseStateRates("IL:-1")).toThrow(/IL/)
    expect(() => parseStateRates("IL:101")).toThrow(/IL/)
  })

  it("throws on an empty input", () => {
    expect(() => parseStateRates("")).toThrow()
  })

  it("rejects a duplicate state", () => {
    expect(() => parseStateRates("IL:10,IL:9")).toThrow(/IL/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx jest src/lib/__tests__/state-rates.test.ts
```
Expected: FAIL — cannot find module `../state-rates`.

- [ ] **Step 3: Write the parser**

Create `backend/src/lib/state-rates.ts`:

```ts
/**
 * Parses the `--rates=IL:10.25,CA:7.25` flag for create-us-state-tax-rates.ts
 * (WB-118 Q-06).
 *
 * Throws rather than skipping a malformed pair: silently dropping one means
 * under-collecting tax in that state with no signal at all, which is a
 * liability the operator would only find at audit.
 */

export type StateRate = { state: string; rate: number }

export function parseStateRates(raw: string): StateRate[] {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) {
    throw new Error("--rates is empty; expected e.g. --rates=IL:10.25,CA:7.25")
  }

  const seen = new Set<string>()
  return trimmed.split(",").map((pair) => {
    const parts = pair.split(":")
    if (parts.length !== 2) {
      throw new Error(`Malformed --rates entry "${pair.trim()}"; expected <STATE>:<RATE>`)
    }

    const state = parts[0].trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(state)) {
      throw new Error(`Malformed state code "${parts[0].trim()}" in --rates`)
    }
    if (seen.has(state)) {
      throw new Error(`Duplicate state "${state}" in --rates`)
    }
    seen.add(state)

    const rate = Number(parts[1].trim())
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new Error(`Invalid rate "${parts[1].trim()}" for ${state}; expected 0-100`)
    }

    return { state, rate }
  })
}
```

- [ ] **Step 4: Run the test**

```bash
cd backend && npx jest src/lib/__tests__/state-rates.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the script**

Create `backend/src/scripts/create-us-state-tax-rates.ts`. Model it closely on the existing
`create-us-tax-region.ts` — same `--confirm-host` guard, same "print and refuse without the
flag" behaviour, same logging shape.

```ts
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createTaxRegionsWorkflow } from "@medusajs/medusa/core-flows"

import { parseStateRates } from "../lib/state-rates"

/**
 * Create province-level US tax regions (WB-118 Q-06).
 *
 * create-us-tax-region.ts creates only the COUNTRY-level US region with no
 * default rate, and leaves per-state rates to manual admin entry. If a single
 * US-level rate is entered instead, every state returns the same rate --
 * which is exactly what the 2026-07-28 QA pass found (Chicago and California
 * taxed identically).
 *
 * Idempotent: a state that already has a province region is skipped, not
 * duplicated. Which states have nexus is the merchant's determination; this
 * script is only the mechanism.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- --rates=IL:10.25,CA:7.25
 *      (prints the target host + the parsed plan; refuses to act)
 *   npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- \
 *      --confirm-host=<host> --rates=IL:10.25,CA:7.25
 */

function parseDbHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

function extractFlag(name: string): string | null {
  for (const arg of process.argv) {
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1)
  }
  return null
}

export default async function createUsStateTaxRates({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const tax = container.resolve(Modules.TAX) as any

  const host = parseDbHost(process.env.DATABASE_URL)
  if (!host) {
    logger.error("[us-state-tax] DATABASE_URL is not a valid URL; refusing to act.")
    return
  }

  const ratesFlag = extractFlag("--rates")
  if (!ratesFlag) {
    logger.error("[us-state-tax] --rates is required, e.g. --rates=IL:10.25,CA:7.25")
    return
  }

  let rates
  try {
    rates = parseStateRates(ratesFlag)
  } catch (e: any) {
    logger.error(`[us-state-tax] ${e.message}`)
    return
  }

  const existing = await tax.listTaxRegions({})
  const usCountry = (existing ?? []).find(
    (r: any) => !r.parent_id && r.country_code === "us"
  )
  if (!usCountry) {
    logger.error(
      "[us-state-tax] No US country tax region exists. Run create-us-tax-region.ts first."
    )
    return
  }

  const existingProvinces = new Set(
    (existing ?? [])
      .filter((r: any) => r.parent_id === usCountry.id && r.province_code)
      .map((r: any) => String(r.province_code).toUpperCase())
  )

  logger.info("")
  logger.info("Create US State Tax Rates")
  logger.info("=========================")
  logger.info(`DATABASE_URL host: ${host}`)
  logger.info(`US country tax region: ${usCountry.id}`)
  for (const { state, rate } of rates) {
    const already = existingProvinces.has(state)
    logger.info(`  ${state}: ${rate}%${already ? "  (already exists — will SKIP)" : ""}`)
  }
  logger.info("")

  const confirmHost = extractFlag("--confirm-host")
  if (!confirmHost) {
    logger.info("To proceed, re-run with:")
    logger.info(
      `  npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- --confirm-host=${host} --rates=${ratesFlag}`
    )
    logger.info("(the `--` separator is required so medusa exec ignores the flags)")
    logger.info("")
    return
  }

  if (confirmHost !== host) {
    logger.error(
      `[us-state-tax] --confirm-host=${confirmHost} does not match DATABASE_URL host (${host}). Aborting.`
    )
    return
  }

  const toCreate = rates.filter((r) => !existingProvinces.has(r.state))
  if (!toCreate.length) {
    logger.info("[us-state-tax] Every requested state already has a province region. Nothing to do.")
    logger.info("=========================")
    return
  }

  await createTaxRegionsWorkflow(container).run({
    input: toCreate.map(({ state, rate }) => ({
      country_code: "us",
      province_code: state.toLowerCase(),
      parent_id: usCountry.id,
      provider_id: "tp_system",
      default_tax_rate: { name: `${state} sales tax`, rate, code: `us-${state.toLowerCase()}` },
    })),
  })

  logger.info(`[us-state-tax] Created ${toCreate.length} province tax region(s).`)
  logger.info("[us-state-tax] VERIFY: two identical carts, one to Chicago IL and one to")
  logger.info("[us-state-tax] Los Angeles CA, must now return DIFFERENT tax.")
  logger.info("=========================")
}
```

- [ ] **Step 6: Verify it compiles and refuses to act without the flag**

```bash
cd backend && npx tsc --noEmit && npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- --rates=IL:10.25,CA:7.25
```
Expected: tsc clean; the script prints the plan and the confirm command, and **does not**
create anything.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/state-rates.ts backend/src/lib/__tests__/state-rates.test.ts backend/src/scripts/create-us-state-tax-rates.ts
git commit -m "feat(WB-118): script to create per-state US tax regions

create-us-tax-region.ts only creates the country-level region, so a single
US rate taxes every state identically -- what the QA pass found. Q-06."
```

---

## Task 9: One free-shipping threshold constant

The spec requires this and no earlier task covers it. The "$199+" figure is currently
written independently on the home page, the PDP and the checkout trust strip; the backend
script has its own `FREE_SHIP_THRESHOLD_USD = 199`. If anyone changes one, the site starts
advertising a promise the cart does not honour — which is the failure mode Q-05 already
demonstrated once.

**Files:**
- Create: `storefront/src/lib/util/shipping-threshold.ts`
- Test: `storefront/src/lib/util/shipping-threshold.test.ts`
- Modify: every storefront file that hard-codes `199` (found in Step 1)
- Modify: `backend/src/scripts/update-shipping-prices.ts` (comment only)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const FREE_SHIPPING_THRESHOLD_USD: number   // 199
  export function freeShippingLabel(): string        // "Free shipping $199+"
  ```

- [ ] **Step 1: Find every hard-coded occurrence**

```bash
cd storefront && grep -rn "199" src --include=*.tsx --include=*.ts | grep -vi "test\|1199\|1990\|:199[0-9]"
```
Record the list — Step 4 must update all of them.

- [ ] **Step 2: Write the failing test**

Create `storefront/src/lib/util/shipping-threshold.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  FREE_SHIPPING_THRESHOLD_USD,
  freeShippingLabel,
} from "./shipping-threshold"

describe("free shipping threshold", () => {
  it("is 199 USD, matching the backend script's FREE_SHIP_THRESHOLD_USD", () => {
    expect(FREE_SHIPPING_THRESHOLD_USD).toBe(199)
  })

  it("renders the customer-facing label from that one number", () => {
    expect(freeShippingLabel()).toBe("Free shipping $199+")
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd storefront && npx vitest run src/lib/util/shipping-threshold.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Write the constant and replace the hard-coded copies**

Create `storefront/src/lib/util/shipping-threshold.ts`:

```ts
/**
 * The free-shipping threshold, in USD major units (WB-118 Q-05).
 *
 * ⚠️ LOCKSTEP TWIN: `FREE_SHIP_THRESHOLD_USD` in
 * `backend/src/scripts/update-shipping-prices.ts`. The two apps install
 * separately (no workspace tool), so this cannot be a shared import -- if you
 * change one, change the other and re-run that script against every
 * environment. The same twin pattern is used for `normalizeFinish` and
 * `canonicalBoltPatterns`; those carry a shared golden fixture, which would be
 * heavier than warranted for a single number.
 *
 * This exists because the "$199+" figure was written independently on the home
 * page, the PDP and the checkout trust strip, while the rule itself lived only
 * in the backend script -- and the script had never been run, so every one of
 * those surfaces was advertising a promise the cart did not honour.
 */
export const FREE_SHIPPING_THRESHOLD_USD = 199

/** The customer-facing label. Never hard-code this string. */
export function freeShippingLabel(): string {
  return `Free shipping $${FREE_SHIPPING_THRESHOLD_USD}+`
}
```

Then replace each occurrence found in Step 1 with `freeShippingLabel()` (or
`FREE_SHIPPING_THRESHOLD_USD` where the number is used in a comparison rather than copy).

- [ ] **Step 5: Add the reciprocal comment to the backend script**

In `backend/src/scripts/update-shipping-prices.ts`, above `const FREE_SHIP_THRESHOLD_USD = 199`:

```ts
// ⚠️ LOCKSTEP TWIN: `FREE_SHIPPING_THRESHOLD_USD` in
// storefront/src/lib/util/shipping-threshold.ts drives the customer-facing
// "$199+" copy. Change both together, then re-run this script against every
// environment -- otherwise the site advertises a threshold the cart does not
// apply (WB-118 Q-05).
```

- [ ] **Step 6: Verify**

```bash
cd storefront && npx vitest run && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
```
Expected: all PASS; storefront tsc exactly **2** errors; backend tsc clean.

- [ ] **Step 7: Commit**

```bash
git add storefront/src/lib/util/shipping-threshold.ts storefront/src/lib/util/shipping-threshold.test.ts storefront/src backend/src/scripts/update-shipping-prices.ts
git commit -m "refactor(WB-118): one free-shipping threshold, twinned with the script

The \$199 figure was hard-coded independently across home, PDP and checkout
while the rule lived only in a backend script that had never been run. Q-05."
```

---

## Task 10: Manual live verification (Stripe test mode)

Component behaviour is not unit-testable in this codebase (see the testing constraint), so
this task is where Tasks 3, 4, 6 and 7 are actually verified. It produces no code.

**Files:**
- Modify: `docs/in-progress/plans/wb-118-task1-findings.md` — append a "Verification" section.

- [ ] **Step 1: Run the stack and reach the payment step**

Same route as Task 1: two products, quantity > 1 on one, US address, shipping method
selected. **Stripe test mode only.**

- [ ] **Step 2: Check the arithmetic by hand on both surfaces**

On `/us/cart` and again on `/us/checkout`, write down every row and add them up. Record:

```
/cart      rows: ...  sum: ...  total shown: ...  MATCH? y/n
/checkout  rows: ...  sum: ...  total shown: ...  MATCH? y/n
Same numbers on both surfaces? y/n
```
All three must be yes.

- [ ] **Step 3: Check the $0.00 field from Task 1 is gone**

Confirm the exact field named in Task 1 now shows the correct amount.

- [ ] **Step 4: Check state validation**

Type `Chicago` into the State field. It must be impossible (it is a select) — and a saved
address carrying `"Illinois"` must preselect `IL`, not blank.

- [ ] **Step 5: Check the postal code and pay**

Confirm a ZIP field is present. Pay with `4242 4242 4242 4242`, any future expiry, CVC
`123`, ZIP `60601`. Confirm the order completes and the Stripe dashboard shows a postal-code
check on the charge.

- [ ] **Step 6: Confirm the charged amount equals the displayed total**

Compare the Stripe charge amount against the TOTAL shown at the payment step. **They must be
identical.** This is the single most important assertion in the wave — if they differ, stop
and report; do not proceed to Task 11.

- [ ] **Step 7: Commit the findings**

```bash
git add docs/in-progress/plans/wb-118-task1-findings.md
git commit -m "test(WB-118): live verification of the checkout money path"
```

---

## Task 11: Runbook + docs

**Files:**
- Modify: `docs/reference/go-live-runbook.md`
- Modify: `docs/future/BACKLOG.md` (WB-118 status)
- Modify: `docs/STATUS.md` ("Last verified" date + the Cart / Checkout pillar row)

- [ ] **Step 1: Add the two ops steps to the runbook**

Add a "WB-118 — shipping and tax configuration" section containing:

```
1. Free shipping over $199 (Q-05) — never run against production:
     cd backend
     npx medusa exec ./src/scripts/update-shipping-prices.ts
     # read the printed host, then:
     npx medusa exec ./src/scripts/update-shipping-prices.ts -- --confirm-host=<host>
   VERIFY: a $150 cart is charged shipping; a $250 cart is not.

2. Per-state US tax (Q-06) — needs the confirmed nexus list first:
     npx medusa exec ./src/scripts/create-us-state-tax-rates.ts -- \
       --confirm-host=<host> --rates=IL:10.25,CA:7.25
   VERIFY: two identical carts, Chicago IL vs Los Angeles CA, return different tax.

NOTE: Standard and Express remain the same price until real carrier rates
exist (WB-123, deliberately deferred 2026-07-29).
```

- [ ] **Step 2: Update the backlog**

In `docs/future/BACKLOG.md`, set WB-118 `status: done` and append a `gate:` line with the
real test counts from Step 4 below.

- [ ] **Step 3: Update STATUS.md**

Bump "Last verified" to the completion date and update the Cart / Checkout pillar row with a
one-line summary.

- [ ] **Step 4: Run the full gate**

```bash
cd storefront && npx vitest run && npx tsc --noEmit && npx next build
cd ../backend && npx jest && npx tsc --noEmit && npx medusa build
```
Expected: storefront tests PASS (was **875 / 121 files** before this wave — expect roughly
+16 from Tasks 2, 6, 8, 9), tsc exactly **2** errors, `next build` exit 0; backend tests
PASS (`test:config` was **24**, full suite **581 / 9 skipped**), tsc clean, `medusa build`
exit 0.

Record the exact numbers — the backlog `gate:` line must cite real counts, not estimates.
If a count comes in *lower* than the baseline, a test was deleted; find out which before
proceeding.

- [ ] **Step 5: Run doc-review**

```
/doc-review
```
Fix anything it flags.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs(WB-118): close out checkout money integrity

Runbook gains the shipping + per-state-tax ops steps; BACKLOG/STATUS
updated with the real gate numbers."
```

---

## Wave 1 exit criteria

Do not call WB-118 done until all of these hold:

- [ ] `cartTotalRows`'s invariant test passes **against the real captured cart** (Task 2), not only synthetic ones.
- [ ] `/cart` and `/checkout` display the same numbers for the same cart, verified by hand (Task 10 Step 2).
- [ ] **The Stripe charge equals the displayed total** (Task 10 Step 6).
- [ ] The `$0.00` field from Task 1 is fixed — or Task 1 recorded `NOT REPRODUCED` and the report says so plainly.
- [ ] `"Chicago"` cannot be entered as a state on either address form, and a saved `"Illinois"` preselects `IL` (Task 10 Step 4).
- [ ] A postal code is collected and Stripe reports a postal check on the charge (Task 10 Step 5).
- [ ] Both ops scripts run clean **in refuse-to-act mode** against a real host. Executing them against production is the operator's call, not this wave's.
- [ ] Storefront `tsc --noEmit` still reports exactly 2 errors; `next build` and `medusa build` both exit 0.
- [ ] No DOM testing stack was added (`@testing-library/*`, `jsdom`, `happy-dom` are all still absent from `storefront/package.json`).

## What this wave deliberately does NOT do

- Differentiate Express from Standard pricing (WB-123 — blocked on carrier rates).
- Add a tax provider (Stripe Tax / TaxJar) — the client chose per-state rates.
- Touch Meilisearch, the vendor-sync pipeline, or the discovery surfaces.
- Place a real order or handle a real card.
