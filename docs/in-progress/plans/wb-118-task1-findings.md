# WB-118 Task 1 — Reproduction findings

**Captured:** 2026-07-29, live production storefront
(`storefront-production-0088.up.railway.app`), cart `cart_01KYPQK3ERBAQCC9VGCJE5Y2SS`.
No order was placed — the session stopped at the delivery/payment boundary. An
abandoned cart is the only side effect.

**Why production:** `backend/.env` points `DATABASE_URL` at `trolley.proxy.rlwy.net` —
there is no local database. Running a local backend would have meant pointing a local
process at the live DB, which is strictly more invasive than reading a cart through the
live storefront.

**Cart used:** Performance Replicas 101, variant `101C-816524`
(`5X4.5 18x10 ET24 CB70.7 LR1400`), quantity 1, unit price $333.00. Shipping address
Chicago, IL 60601. Standard Shipping ($10.00) selected.

Fixture: [`storefront/src/lib/util/__fixtures__/cart-payment-step.json`](../../../storefront/src/lib/util/__fixtures__/cart-payment-step.json)
(PII redacted; every numeric field byte-exact; `city`/`province`/`postal_code`/`country_code` kept).

---

## Q-01 — which field renders `$0.00`

```
Q-01 field that renders $0.00:  data-testid="product-price" — the cart line's
                                TOTAL column (component: LineItemPrice)
Q-01 raw value of that field:   ABSENT. The line item object has no `total` key at all.
```

Rendered on `/us/cart`:

| test id | component | shows | correct? |
|---|---|---|---|
| `product-unit-price` | `LineItemUnitPrice` | **$333.00** | ✓ |
| `product-price` | `LineItemPrice` | **$0.00** | ✗ **the bug** |
| `cart-subtotal` | `CartTotals` | $333.00 | ✓ |
| `cart-taxes` | `CartTotals` | $33.30 | ✓ |
| `cart-total` | `CartTotals` | $366.30 | ✓ |

The line item's full key set in the Store API response:

```
adjustments, compare_at_unit_price, created_at, id, is_tax_inclusive, metadata,
product, product_collection, product_description, product_handle, product_id,
product_subtitle, product_title, product_type, product_type_id, quantity,
requires_shipping, tax_lines, thumbnail, title, unit_price, updated_at, variant,
variant_barcode, variant_id, variant_sku, variant_title
```

No `total`, no `subtotal`, no `tax_total`. Per-line totals are simply not decorated on
this response — only cart-level totals are. `lineItemAmounts` therefore returns
`total = item.total ?? 0` → `0`, and `LineItemPrice` renders `$0.00`.

### ⚠️ This is the mirror image of the hypothesis in the spec

The spec guessed the **unit price** was zero because `??` won't fall back on a `0`. It is
the opposite: **`unit_price` is fine (333) and the `total` is missing.** The tester's
"showing correct price below tho" was the unit-price column, not the total.

Had the plan not been reproduce-first, the fix would have been applied to the wrong field
and the bug would have survived. → **Task 5 takes Branch A, but for `total`, not
`unitPrice`.**

`shipping_methods[0]` is likewise undecorated (`total: null, subtotal: null,
tax_total: null` with only `amount: 10`), so nothing may read per-method totals either.

---

## Q-02 — the summary math, with shipping selected

Rendered at `/us/checkout?step=delivery`:

```
Subtotal  $343.00
Shipping   $11.00
Tax        $34.30
TOTAL     $377.30
```

```
Q-02 sum of rows as displayed:  388.30
Q-02 cart.total:                377.30
Q-02 difference:                 11.00   (exactly shipping_total)
```

Raw cart totals from the payload:

| field | value |
|---|---|
| `item_subtotal` | 333.00 |
| `shipping_subtotal` | 10.00 |
| `subtotal` | **343.00** ← items + shipping |
| `item_tax_total` | 33.30 |
| `shipping_tax_total` | 1.00 |
| `tax_total` | **34.30** |
| `shipping_total` | 11.00 ← includes its own $1.00 tax |
| `discount_subtotal` / `credit_line_total` | 0 |
| `total` | **377.30** |

This confirms the source reading exactly: `subtotal` (343) already contains
`shipping_subtotal` (10), and `tax_total` (34.30) already contains `shipping_tax_total`
(1.00). Rendering a separate `shipping_total` row ($11) on top adds both again — hence
overstating by precisely $11.00.

**Verified fix, computed against this real cart:**

```
item_subtotal 333.00 + shipping_subtotal 10.00 + tax_total 34.30
  − discount_subtotal 0 − credit_line_total 0  =  377.30  ===  cart.total ✓
```

### The tester's "$11 ADDED ON EVERY SHIPPING" is this bug

It reads as a hidden fee, but it is the display double-count. Q-02 and Q-05 are the same
defect seen from two angles — with free shipping the error is invisible, and the flat $10
fee is what exposes it.

---

## Incidental findings (not in Wave 1's scope — recorded so they aren't lost)

**1. The live tax rate is a placeholder.** The line item's tax line reads verbatim:

```json
{ "description": "Defaul Tax rate For Testing", "code": "12223", "rate": 10 }
```

A flat **10%** applied regardless of destination — note the typo in "Defaul", clearly
hand-entered in admin. This is the mechanism behind Q-06 (Chicago and California taxed
identically), and it means the live store is currently charging real customers a rate
labelled "For Testing". **Worth raising with the client ahead of the Task 8 script**, since
the nexus list is theirs to supply either way.

**2. Q-09 confirmed on the delivery step**, both options rendered together:

```
Express Shipping   Ship in 24 hours.   $10.00
Standard Shipping  Ship in 2-3 days.   $10.00
```

**3. Q-05 confirmed.** The trust strip reads "Free shipping on orders $199+" directly
beneath a **$333** cart that was still charged $10 shipping.

**4. `/cart` shows "Shipping $0.00" before any method is selected** — reads as a promise of
free shipping that the delivery step then contradicts. `cartTotalRows` omits the row until
a method exists, which fixes this incidentally.
