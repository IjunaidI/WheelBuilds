import { clx } from "@medusajs/ui"

import { getPercentageDiff } from "@lib/util/get-precentage-diff"
import { getPricesForVariant } from "@lib/util/get-product-price"
import { hasReducedPrice as computeHasReducedPrice } from "@lib/util/has-reduced-price"
import { lineItemAmounts } from "@lib/util/line-item-amounts"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type LineItemPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
  // WB-092 fixwave C1: the stored AMOUNT comes from the item, but a
  // discontinued/unpriced variant makes `getPricesForVariant` return null, so
  // the CURRENCY must come from the cart/order instead — never from the live
  // variant. Required so a discontinued line never silently loses its "$".
  currencyCode: string
}

const LineItemPrice = ({ item, style = "default", currencyCode }: LineItemPriceProps) => {
  // Source of truth: the stored/charged line total. Never the live variant
  // price — that drifts after a vendor-sync reprice and is `undefined` for a
  // discontinued (drafted) product, which used to render a bare "NaN".
  const { total: currentPrice } = lineItemAmounts(item)

  // Decoration only: an original/strikethrough price, shown only when the
  // live variant price still resolves.
  const livePrices = getPricesForVariant(item.variant)
  const originalPrice = (livePrices?.original_price_number ?? 0) * item.quantity
  // WB-092 fixwave C4: the badge is a claim about a CURRENT, genuine sale, so
  // it must compare live-vs-live (calculated < original on the live variant),
  // not the stored charged price against the live original. Comparing stored
  // vs. live falsely paints a discount when the list price simply rose after
  // the item was added to the cart -- there was never a promotion running.
  // See @lib/util/has-reduced-price for the (tested) decision + rationale.
  const hasReducedPrice = computeHasReducedPrice(livePrices)

  return (
    <div className="flex flex-col gap-x-2 text-ui-fg-subtle items-end">
      <div className="text-left">
        {hasReducedPrice && (
          <>
            <p>
              {style === "default" && (
                <span className="text-ui-fg-subtle">Original: </span>
              )}
              <span
                className="line-through text-ui-fg-muted"
                data-testid="product-original-price"
              >
                {convertToLocale({
                  amount: originalPrice,
                  currency_code: currencyCode,
                })}
              </span>
            </p>
            {style === "default" && (
              <span className="text-ui-fg-interactive">
                -{getPercentageDiff(originalPrice, currentPrice || 0)}%
              </span>
            )}
          </>
        )}
        <span
          className={clx("text-base-regular", {
            "text-ui-fg-interactive": hasReducedPrice,
          })}
          data-testid="product-price"
        >
          {convertToLocale({
            amount: currentPrice,
            currency_code: currencyCode,
          })}
        </span>
      </div>
    </div>
  )
}

export default LineItemPrice
