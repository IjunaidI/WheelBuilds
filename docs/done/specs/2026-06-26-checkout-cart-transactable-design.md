# Checkout & cart — make it transactable (G2) — Design

> Spec for backlog group **G2** — items **WB-033, WB-034, WB-036, WB-047, WB-035**, plus the
> folded-in **WB-053** (Meili browse cap). Date: 2026-06-26. Status: in-progress.
> Pillars: Cart / Checkout (+ Discovery for WB-053).
> Storefront-local except WB-053 (one backend config line). No DB migration, no new dependency.

## Context

The catalog is live (2,670 wheels) and the PDP can add to cart (WB-001) — but the **buy path** has
gaps that block or mislead a real customer. This group fixes the genuinely-broken pieces and makes the
non-functional payment chrome honest. Design principle (same as G3): **logic lives in pure,
unit-testable helpers; React/server components are thin consumers.**

Survey facts the design is built on (verified 2026-06-26):
- The checkout page RSC (`(checkout)/checkout/page.tsx`) does NOT read `searchParams`; step selection is
  entirely client-side (each section reads `useSearchParams().get("step")`). A bare `/checkout` renders
  every section collapsed.
- The cart page (`(main)/cart/page.tsx:21`) already calls `enrichLineItems`, so cart `Item` receives
  `variant.inventory_quantity` + `manage_inventory` (enrichment requests `+variants.inventory_quantity`).
- `discount-code/index.tsx` retains existing codes with `(p) => p.code === undefined` — inverted; this
  wipes all codes on remove and drops existing on add.
- `cart.ts` `applyGiftCard` / `removeGiftCard` / `removeDiscount` are fully commented-out no-ops (v1 API
  shape; unused by any live UI). `applyPromotions` (used for add+remove) works.
- No payment provider for wallets/Affirm: storefront has no Stripe key; `ExpressPay` buttons fire a
  "coming soon" toast; the Affirm line in `checkout-summary` is static text.
- `medusa-config.js` `indexSettings` sets no `pagination.maxTotalHits` (Meili default 1000).

---

## WB-033 · Direct nav to `/checkout` stalls (no default `?step=`)

### Fix
In `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx` (an async RSC), read the Next 15
`searchParams` promise and redirect to the address step when no `step` is present:

```tsx
// signature gains searchParams (Next 15: it's a Promise)
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
  // ...existing cart fetch + render unchanged
}
```

`redirect` from `next/navigation`. The four client step components are untouched — they already key off
`?step=`. Always landing on `address` is the simplest correct fix (the verify only requires the address
step to render); computing the first-incomplete step is explicitly out of scope.

### Verify
Navigating to `/<countryCode>/checkout` with no `?step=` redirects to `?step=address` and renders the
address form open.

---

## WB-034 · Cart qty cap ignores live stock

### Fix
The data is already on the enriched line item. Extract a **pure helper** in a new
`storefront/src/modules/cart/components/item/max-qty.ts` (colocated with the item component):

```ts
const FALLBACK_MAX = 10 // unmanaged / backorderable: no real stock ceiling to honor

/**
 * Max quantity selectable for a cart line. Honors live inventory when the
 * variant manages stock and disallows backorder; otherwise falls back to a
 * sane cap. Never returns below currentQty, so a stock drop after add-to-cart
 * cannot make the already-in-cart quantity unselectable.
 */
export function maxSelectableQty(
  variant: { inventory_quantity?: number | null; manage_inventory?: boolean | null; allow_backorder?: boolean | null } | undefined,
  currentQty: number
): number {
  const managed = variant?.manage_inventory === true
  const backorder = variant?.allow_backorder === true
  if (!managed || backorder) return Math.max(FALLBACK_MAX, currentQty)
  const stock = Math.max(0, variant?.inventory_quantity ?? 0)
  return Math.max(stock, currentQty)
}
```

In `storefront/src/modules/cart/components/item/index.tsx`: replace the hardcoded
`maxQtyFromInventory = 10` / `maxQuantity` block (lines ~45-47) with
`const maxQuantity = maxSelectableQty(item.variant, item.quantity)`, and render the `<option>` list
`1..maxQuantity` (drop the redundant `Math.min(maxQuantity, 10)` at line ~90).

### Tests (storefront Vitest)
- managed, stock 3, currentQty 1 → 3; managed, stock 3, currentQty 5 → 5 (never below current).
- `manage_inventory` false → FALLBACK_MAX; `allow_backorder` true → FALLBACK_MAX.
- stock 0, currentQty 2 → 2.

---

## WB-036 · Discount remove/add bug (gift cards deferred)

### Fix — the bug
`storefront/src/modules/checkout/components/discount-code/index.tsx` keeps existing non-automatic codes
with `(p) => p.code === undefined` (inverted). Extract a **pure helper** in a new
`storefront/src/modules/checkout/components/discount-code/promo-codes.ts`:

```ts
import { HttpTypes } from "@medusajs/types"

/**
 * The manual (user-entered) promo codes to keep when re-applying the cart's
 * promotions. Pass removeCode to exclude exactly one (the remove path); omit it
 * to retain all manual codes (the add path, before pushing the new code).
 * Automatic promotions (code === undefined/null) are never sent back — Medusa
 * re-derives them — so they are filtered OUT here.
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

Rewire the component:
- `removePromotionCode(code)` → `await applyPromotions(retainedPromoCodes(promotions, code))`
- `addPromotionCode(code)` → `await applyPromotions([...retainedPromoCodes(promotions), code])`

### Fix — gift cards (deferred, dead-code removal)
Delete the three commented-out no-op stubs `applyGiftCard`, `removeGiftCard`, `removeDiscount` from
`storefront/src/lib/data/cart.ts` (verify no importers first — grep). File a new backlog item
**WB-054 · Medusa v2 gift-card apply/remove (backend workflow + storefront UI)** for the real work.

### Tests (storefront Vitest)
- two manual codes [A,B] + one automatic (code null), removeCode B → [A].
- same set, no removeCode → [A,B] (automatic excluded).
- empty promotions → [].

---

## WB-047 · Stale "Medusa Store" / "test order" copy

### Fix
- `storefront/src/modules/checkout/components/review/index.tsx` (~line 43-44): change
  `"...read Medusa Store's Privacy Policy."` → `"...read Wheel Builds' Privacy Policy."`
- `storefront/src/modules/order/templates/order-completed-template.tsx`: remove the conditional render
  of `<OnboardingCta />` (the `_medusa_onboarding` cookie block, ~lines 32 + 40-44) and the now-unused
  import. Delete the orphaned `storefront/src/modules/order/components/onboarding-cta/` component.
- Grep `storefront/src/modules/{order,checkout}/` for `Medusa Store` and `test order` after the edits →
  no user-facing matches remain (code comments are fine).

### Verify
`grep -rn "Medusa Store\|test order" storefront/src/modules/order storefront/src/modules/checkout`
returns no user-facing copy; the order-confirmation page no longer renders the onboarding CTA.

---

## WB-035 · Express Pay / Affirm chrome → env-gated (hidden by default)

### Fix
Two explicit, default-off env flags (NOT gated on the Stripe key — wiring Stripe *card* payments must not
surface non-functional *wallet* buttons). Add a tiny helper module
`storefront/src/modules/checkout/components/express-pay/config.ts`:

```ts
/** Wallet express pay (Apple/Google) is wired — default OFF until a provider exists. */
export const isExpressPayEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED === "true"

/** Affirm BNPL messaging is wired — default OFF until Affirm is integrated. */
export const isAffirmEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_AFFIRM_ENABLED === "true"
```

- `checkout-form/index.tsx` (~line 31): wrap the `<ExpressPay />` mount in `{isExpressPayEnabled() && …}`.
- `checkout-summary/index.tsx` Totals (~lines 183-188): wrap the "OR 4× … WITH AFFIRM" block in
  `{isAffirmEnabled() && total > 0 && …}`.
- `storefront/.env.local.template`: document both flags (commented, default off) with a one-line note that
  they only enable UI for providers that must be separately wired.

The `ExpressPay` component's internal "coming soon" toast handlers stay as-is (they only render when the
flag is on, i.e. when a real integration replaces them) — no behavior change is shipped to users today
because the section is hidden.

### Verify
With neither flag set (default), the Express Pay section and the Affirm line are absent from the checkout
DOM. Setting `NEXT_PUBLIC_EXPRESS_PAY_ENABLED=true` renders the section again.

### Tests (storefront Vitest)
- `isExpressPayEnabled()` / `isAffirmEnabled()` true only for the literal `"true"`; false for unset / `"false"` / other.

---

## WB-053 · Meili browse capped at default `maxTotalHits=1000` (fold-in)

### Fix
In `backend/medusa-config.js`, add to the `@rokmohar/medusa-plugin-meilisearch` products `indexSettings`
(after `sortableAttributes`):

```js
      pagination: { maxTotalHits: 10000 },
```

Lifts the unfiltered `/store` browse past 1,000 so the page count tracks the real catalog. **Activates on
next deploy / Meili settings re-sync** (the plugin pushes index settings on boot). Deep-pagination perf
cost is negligible at 10k. No storefront change required (the discovery adapter already paginates).

### Verify
After redeploy/re-sync, an unfiltered `/store` paginates past 84 pages and the result count tracks the
Meili document count (≈2,670), not 1,000.

---

## Out of scope (explicitly)
- **Gift cards** — real Medusa-v2 gift-card support (WB-054, filed by this work) is a separate feature.
- **Real wallet/Affirm integration** — needs provider credentials; this group only hides the chrome.
- First-incomplete-step computation for the checkout redirect; real product photography; tire checkout.

## File inventory (what the plan will touch)
**New**
- `storefront/src/modules/cart/components/item/max-qty.ts` (+ test)
- `storefront/src/modules/checkout/components/discount-code/promo-codes.ts` (+ test)
- `storefront/src/modules/checkout/components/express-pay/config.ts` (+ test)

**Modified**
- `storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx` (WB-033 redirect)
- `storefront/src/modules/cart/components/item/index.tsx` (WB-034 use helper)
- `storefront/src/modules/checkout/components/discount-code/index.tsx` (WB-036 use helper)
- `storefront/src/lib/data/cart.ts` (WB-036 delete dead gift-card/removeDiscount stubs)
- `storefront/src/modules/checkout/components/review/index.tsx` (WB-047 brand copy)
- `storefront/src/modules/order/templates/order-completed-template.tsx` (WB-047 drop onboarding CTA)
- `storefront/src/modules/checkout/templates/checkout-form/index.tsx` (WB-035 gate ExpressPay)
- `storefront/src/modules/checkout/templates/checkout-summary/index.tsx` (WB-035 gate Affirm line)
- `storefront/.env.local.template` (WB-035 document flags)
- `backend/medusa-config.js` (WB-053 maxTotalHits)

**Deleted**
- `storefront/src/modules/order/components/onboarding-cta/` (orphaned after WB-047)

## Verification (whole group)
- `cd storefront && pnpm test:unit` — new `max-qty`, `promo-codes`, `express-pay config` tests green; existing 75 still pass.
- `cd storefront && npx tsc --noEmit` — no new errors (15 pre-existing on main).
- `grep` confirms no remaining user-facing "Medusa Store"/"test order"; no importers of the deleted stubs.
- `node -e` / config load confirms `medusa-config.js` stays valid JSON-ish (require parses).
- Manual smokes (deferred to pre-deploy, live backend): bare `/checkout` → address; cart qty cap matches a known low-stock variant; apply two promo codes then remove one keeps the other; Express Pay/Affirm absent by default.
