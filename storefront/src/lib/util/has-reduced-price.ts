import { getPricesForVariant } from "./get-product-price"

type LivePrices = ReturnType<typeof getPricesForVariant>

/**
 * Decide whether a genuine, CURRENT sale badge ("Original: $X / -Y%") should
 * render alongside a cart/order line's price.
 *
 * WB-092 fixwave C4: this must compare the live variant's calculated price
 * against its own live original price -- never the stored/charged price
 * (what the customer was actually billed) against the live original. The
 * latter paints a fabricated discount whenever the list price simply rose
 * after the item was added to the cart: there was never an active
 * promotion, just inflation, but `storedPrice < newOriginalPrice` reads the
 * same as a real sale unless the comparison is live-vs-live.
 *
 * The DISPLAYED amount is a separate concern (see `lineItemAmounts`) and
 * always stays the stored `item.total` / `item.unit_price` regardless of
 * what this function returns.
 */
export function hasReducedPrice(
  livePrices: LivePrices | undefined
): boolean {
  return (
    !!livePrices &&
    livePrices.calculated_price_number < livePrices.original_price_number
  )
}
