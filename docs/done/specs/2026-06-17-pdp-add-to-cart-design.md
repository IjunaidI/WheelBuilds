# Design — Wire PDP Add to Cart + Buy Now (WB-001)

> Status: in-progress · Author: 2026-06-17 · Backlog: [WB-001](../../future/BACKLOG.md) [BLOCKER]

## Problem

The PDP purchase panel cannot transact. `handleAddToCart`, `handleBuyNow`, and
`handleSave` in
[`storefront/src/modules/product-detail/components/hero/purchase-panel.tsx:43-68`](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx)
each only fire a `sonner` toast behind a `// TODO(integration)` comment. No line
item is ever created; "Buy now" routes to `/checkout` with an empty cart (which
renders the empty-cart state). The store is non-functional for purchasing — this
is the single highest-leverage blocker, gating the entire PDP → cart → checkout →
order funnel.

The root cause is that the Medusa `variant.id` is **discarded during mapping**:
[`get-product.ts → toSizeOptions`](../../../storefront/src/modules/product-detail/data/get-product.ts)
groups variants into a Diameter×Width matrix and accumulates `OffsetVariant`s that
carry offset/price but not the variant id. The hero already resolves the selected
variant conceptually (`currentOffset` = `selectedSize × selectedOffsetMm`, used to
price the selected ET) — it just has no id to add to the cart.

## Goals

1. Add-to-Cart from the PDP creates a real Medusa cart line item for the exact
   selected variant (size × offset), with the chosen quantity.
2. Buy Now adds the same line item, then sends the user into checkout at a defined
   step (`?step=address`).
3. Correct failure + stock handling: errors surface as a toast; out-of-stock or
   unresolved selections disable the action rather than adding a bad line item.

## Non-goals / Out of scope

- **WB-003** (bolt-pattern grid axis). The size grid still groups by Diameter×Width
  only; the bolt-pattern picker stays cosmetic. We do not make bolt pattern a
  variant-resolution axis here. No regression — behavior is unchanged on that axis.
- **WB-033** (checkout step state machine). We target the already-defined
  `?step=address` so Buy Now lands correctly; we do not rework the checkout step flow.
- **Wishlist.** `handleSave` stays toast-only — there is no wishlist backend. Not
  part of WB-001's "cannot transact" fix.
- **WB-029** (qty default, low-stock threshold de-hardcoding). The `quantity`
  default of 4 and `availabilityOf`'s `≤4` threshold are untouched.

## Approach

**Thread the real `variant.id` (and per-offset availability) onto `OffsetVariant`,
resolve the selected variant in the hero, and rewire the panel's two commerce
handlers.** This is the smallest change consistent with how the hero already prices
the selected offset.

Rejected alternatives:
- *Flat raw-variant list resolved by all axes incl. bolt pattern* — more robust
  against bolt-pattern ambiguity, but that is WB-003; it expands scope.
- *Re-derive from `selectedSize` only, ignoring the offset pick* — lossy; could add
  the wrong ET.

## Design

### 1. Data model — `OffsetVariant`
[`storefront/src/modules/product-detail/data/types.ts`](../../../storefront/src/modules/product-detail/data/types.ts)

Add two fields to `OffsetVariant`:
- `variantId: string` — the Medusa `variant.id`. Drives the cart line item.
- `availability: "in_stock" | "low_stock" | "out_of_stock"` — per-offset stock, so a
  user who selects an out-of-stock ET hiding under an in-stock size cell is blocked.

(`SizeOption` keeps its best-of-siblings `availability` for the grid cell; the new
per-offset field is what the purchase action checks.)

### 2. Mapping — `toSizeOptions`
[`get-product.ts`](../../../storefront/src/modules/product-detail/data/get-product.ts)

When building each offset entry (both the new-size and existing-size branches), set:
- `variantId: v.id`
- `availability: availabilityOf(qty)`

No other shape change; price/availability roll-ups at the size level are unchanged.

### 3. Variant resolution — pure helper (testable seam)

Extract a pure function (new file under `product-detail/data/`, e.g.
`resolve-variant.ts`):

```
resolveSelectedVariant(size: SizeOption, offsetMm: number): OffsetVariant | null
```

Returns the `OffsetVariant` whose `value === offsetMm` (the same match the hero
already does for `currentOffset`), or `null` if none. This is the unit-tested core.

### 4. Hero threading
[`hero/index.tsx`](../../../storefront/src/modules/product-detail/components/hero/index.tsx)

The hero already computes `currentOffset`. Pass the resolved selection into
`<PurchasePanel>` via a new prop — `selectedVariant: { variantId, availability } | null`
(derived from `currentOffset`). No new state.

### 5. Panel rewire
[`purchase-panel.tsx`](../../../storefront/src/modules/product-detail/components/hero/purchase-panel.tsx)

- `handleAddToCart` → `await addToCart({ variantId, quantity, countryCode })`
  ([`lib/data/cart.ts`](../../../storefront/src/lib/data/cart.ts), already a
  `"use server"` action). On resolve: success toast (keep existing copy). On throw:
  error toast. A `pending` state disables the button during the request.
- `handleBuyNow` → same add, then
  `router.push(\`/${countryCode}/checkout?step=address\`)`. On add failure: error
  toast, no navigation.
- `handleSave` → unchanged (toast).
- Disable Add + Buy when the resolved `availability === "out_of_stock"`, when there is
  no `variantId`, or while a request is in flight.

`countryCode` is already read via `useParams()`; `quantity` already exists in state.

### 6. Error + feedback UX

- `addToCart` surfaces backend errors through `medusaError`; the handler catches and
  toasts a friendly message.
- Plain Add keeps the user on the PDP. The nav cart-count badge updates because the
  server action calls `revalidateTag("cart")`. No forced drawer/navigation.

## Testing

- **Unit (vitest, pure):** `resolveSelectedVariant` — returns the right `variantId`
  for a given size+offset; picks the correct sibling among multiple offsets; returns
  `null` when the offset is absent. Matches the existing pure-function test style
  (`src/lib/fitment/__tests__/*`, `parse-fit.test.ts`, …).
- **Manual verification:** on a running storefront, add a wheel to the cart from a
  PDP → the cart count increments and `/cart` shows the line item with the correct
  variant + quantity; Buy Now lands on `/<cc>/checkout?step=address` with the item
  present; an out-of-stock selection disables the buttons.

The client-panel ↔ server-action interaction is not unit-tested (client component +
server action); it is covered by the manual pass.

## Acceptance criteria

1. Adding to cart from a PDP persists a real Medusa cart line item for the selected
   `variant.id` and quantity.
2. Buy Now adds the line item, then navigates to `/<cc>/checkout?step=address`.
3. No toast-only branch remains on the cart/buy paths;
   `grep` shows a real `addToCart` call in `purchase-panel.tsx`. (`handleSave` may
   remain toast-only — wishlist has no backend.)
4. Out-of-stock or unresolved selections disable Add/Buy; backend failures show an
   error toast and add nothing.
5. `resolveSelectedVariant` has passing vitest coverage; the full storefront suite
   stays green.
6. This design moves `in-progress → done` when the work merges; WB-001 flips to
   `done`, STATUS PDP row + "Last verified" updated.

## Risks & mitigations

- **Wrong variant via bolt-pattern collapse.** If a product genuinely has distinct
  bolt-pattern variants at the same Diameter×Width×ET, the existing grouping keeps one
  (WB-003). Mitigation: documented as out of scope; no regression vs. today, and the
  common single-bolt-pattern product resolves correctly.
- **Buy Now stall (WB-033).** Mitigated by targeting `?step=address` (a defined step)
  rather than bare `/checkout`.
- **Cart count not refreshing.** `addToCart` already calls `revalidateTag("cart")`;
  this is the same mechanism the legacy product add-to-cart relies on.
