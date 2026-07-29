"use client"

import { cartTotalRows, type CartLikeTotals } from "@lib/util/cart-total-rows"
import { convertToLocale } from "@lib/util/money"
import React from "react"

type CartTotalsProps = {
  /**
   * Any cart-like object carrying Medusa's totals fields. Kept loose so both
   * `StoreCart` and `StoreOrder` work — the shape `cartTotalRows` needs is a
   * subset of both.
   */
  totals: CartLikeTotals
}

/**
 * WB-118 Q-02: every row here comes from `cartTotalRows`, which is the only
 * place money-row semantics live and which is unit-tested to sum to
 * `cart.total`. This component is deliberately a thin `.map()` — do not
 * reintroduce per-field reads here, or /cart and /checkout can drift apart
 * again.
 *
 * The old version rendered "Subtotal (excl. shipping and taxes)" from
 * `cart.subtotal`, which was factually wrong: Medusa's `subtotal` excludes
 * taxes but INCLUDES shipping.
 */
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
        <span
          className="txt-xlarge-plus"
          data-testid="cart-total"
          data-value={total}
        >
          {convertToLocale({ amount: total, currency_code: currencyCode })}
        </span>
      </div>
      <div className="h-px w-full border-b border-gray-200 mt-4" />
    </div>
  )
}

export default CartTotals
