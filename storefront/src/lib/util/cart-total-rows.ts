/**
 * The single source of truth for the money breakdown shown on /cart and
 * /checkout (WB-118 Q-02).
 *
 * Derived from @medusajs/utils 2.13.6 `decorateCartTotals`
 * (dist/totals/cart/index.js):
 *
 *   subtotal = Σ item.subtotal + Σ shippingMethod.subtotal   // lines 66 AND 87
 *   taxTotal = itemsTaxTotal + shippingTaxTotal              // line 106
 *   total    = (subtotal + taxTotal) − discountSubtotal − creditLinesTotal
 *   shipping_total = Σ shippingMethod.total                  // tax INCLUDED
 *
 * The load-bearing fact is line 87: **`cart.subtotal` already contains the
 * shipping subtotal.** Both surfaces used to render
 * `subtotal − discount_total + shipping_total + tax_total`, which
 *
 *   1. counted shipping TWICE — its subtotal is already inside `subtotal` and
 *      its tax is already inside `tax_total`, yet `shipping_total` (which is
 *      both) was added on top;
 *   2. subtracted `discount_total` where the real formula uses
 *      `discount_subtotal`; and
 *   3. never showed `credit_line_total` at all.
 *
 * Measured on a live cart 2026-07-29: the page displayed 343.00 + 11.00 +
 * 34.30 = 388.30 against a charged total of 377.30 — overstated by exactly
 * `shipping_total`. See docs/in-progress/plans/wb-118-task1-findings.md.
 *
 * We rebuild `subtotal` from its two halves instead, so the rows reconcile
 * with the charged total by construction:
 *
 *   item_subtotal + shipping_subtotal + tax_total
 *     − discount_subtotal − credit_line_total  ===  total
 *
 * `total` is ALWAYS `cart.total` verbatim — the amount actually charged —
 * never a client-side re-computation. The rows explain that number; they do
 * not define it. If a future Medusa version adds a component we don't render,
 * the invariant test fails loudly rather than the page quietly lying.
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

/**
 * Any cart-like object carrying Medusa's totals fields. Deliberately looser
 * than `HttpTypes.StoreCart` so `StoreOrder` works too — the fields needed
 * here are a subset of both.
 */
export type CartLikeTotals = {
  currency_code?: string | null
  item_subtotal?: number | null
  shipping_subtotal?: number | null
  tax_total?: number | null
  discount_subtotal?: number | null
  credit_line_total?: number | null
  total?: number | null
}

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

export function cartTotalRows(cart: CartLikeTotals): CartTotalsView {
  const items = num(cart.item_subtotal)
  const shipping = num(cart.shipping_subtotal)
  const tax = num(cart.tax_total)
  const discount = num(cart.discount_subtotal)
  const credit = num(cart.credit_line_total)

  const rows: CartTotalRow[] = [{ key: "items", label: "Items", amount: items }]

  // Omitted entirely until a shipping method is chosen. "Shipping $0.00"
  // before that step reads as a promise of free shipping which the delivery
  // step then contradicts — observed live on /cart during the Task 1 capture.
  if (shipping !== 0) {
    rows.push({ key: "shipping", label: "Shipping", amount: shipping })
  }
  if (discount !== 0) {
    rows.push({
      key: "discount",
      label: "Discount",
      amount: discount,
      negative: true,
    })
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
