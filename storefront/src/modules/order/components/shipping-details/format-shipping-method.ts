import { convertToLocale } from "@lib/util/money"

type ShippingMethodLike = {
  name?: string | null
  total?: number | null
}

type OrderLike = {
  shipping_methods?: ShippingMethodLike[] | null
  currency_code: string
}

/**
 * Formats the order's (single) shipping method as `{ name, amountLabel }` for
 * the confirmation page's "Method" summary. Fixes two WB-092 C6 bugs:
 *
 *  - `order.shipping_methods?.[0].total` only guarded the ARRAY access —
 *    an empty-but-present `shipping_methods` array makes `[0]` `undefined`,
 *    and the unguarded `.total`/`.name` off of that threw. Guarded here via
 *    a single `?.[0]` read followed by `?.` on every field.
 *  - the amount used to go through `.replace(/,/g,"").replace(/\./g,",")`,
 *    a euro-style decimal swap that mangled "$10.00" into "$10,00". Deleted
 *    — `convertToLocale` already renders the correct locale string.
 */
export function formatShippingMethod(order: OrderLike): {
  name: string
  amountLabel: string
} {
  const method = order.shipping_methods?.[0]
  return {
    name: method?.name ?? "",
    amountLabel: convertToLocale({
      amount: method?.total ?? 0,
      currency_code: order.currency_code,
    }),
  }
}
