import { getPercentageDiff } from "@lib/util/get-precentage-diff"
import { getPricesForVariant } from "@lib/util/get-product-price"
import { hasReducedPrice as computeHasReducedPrice } from "@lib/util/has-reduced-price"
import { lineItemAmounts } from "@lib/util/line-item-amounts"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"

type LineItemUnitPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  // WB-092 fixwave C1: currency must come from the cart/order, not the live
  // variant (which is null for a discontinued/unpriced variant) — see
  // line-item-price for the full rationale.
  currencyCode: string
}

const LineItemUnitPrice = ({
  item,
  style = "default",
  currencyCode,
}: LineItemUnitPriceProps) => {
  // Source of truth: the stored/charged unit price, not the live variant
  // price (see line-item-price for why — vendor-sync drift + NaN on a
  // discontinued/drafted product).
  const { unitPrice } = lineItemAmounts(item)

  // Decoration only: an original/strikethrough unit price, shown only when
  // the live variant price still resolves.
  const livePrices = getPricesForVariant(item.variant)
  const originalUnitPrice = livePrices?.original_price_number ?? 0
  // WB-092 fixwave C4: same live-vs-live rule as line-item-price -- a
  // fabricated discount must not appear just because the list price rose
  // after the item was added (stored < new live original, no active sale).
  // See @lib/util/has-reduced-price for the (tested) decision + rationale.
  const hasReducedPrice = computeHasReducedPrice(livePrices)

  return (
    <div className="flex flex-col text-ui-fg-muted justify-center h-full">
      {hasReducedPrice && (
        <>
          <p>
            {style === "default" && (
              <span className="text-ui-fg-muted">Original: </span>
            )}
            <span
              className="line-through"
              data-testid="product-unit-original-price"
            >
              {convertToLocale({
                amount: originalUnitPrice,
                currency_code: currencyCode,
              })}
            </span>
          </p>
          {style === "default" && (
            <span className="text-ui-fg-interactive">
              -{getPercentageDiff(originalUnitPrice, unitPrice)}%
            </span>
          )}
        </>
      )}
      <span
        className={clx("text-base-regular", {
          "text-ui-fg-interactive": hasReducedPrice,
        })}
        data-testid="product-unit-price"
      >
        {convertToLocale({ amount: unitPrice, currency_code: currencyCode })}
      </span>
    </div>
  )
}

export default LineItemUnitPrice
