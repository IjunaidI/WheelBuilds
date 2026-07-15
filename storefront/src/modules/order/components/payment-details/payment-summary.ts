type PaymentCollectionLike<P> = {
  payments?: P[] | null
}

/**
 * Pulls the (single) payment off an order's payment_collections, guarding the
 * empty-array case explicitly. `order.payment_collections?.[0].payments?.[0]`
 * only guarded the COLLECTIONS array — an empty-but-present array makes `[0]`
 * `undefined`, and the unguarded `.payments` access off of that threw
 * (WB-092 C6).
 */
export function firstPayment<P>(
  paymentCollections: PaymentCollectionLike<P>[] | null | undefined
): P | undefined {
  return paymentCollections?.[0]?.payments?.[0]
}

/**
 * Title for a payment provider, falling back to the raw provider id when it
 * isn't in `paymentInfoMap` — `paymentInfoMap[provider_id].title` crashed the
 * whole receipt for any provider the map doesn't happen to list (WB-092 C6).
 */
export function paymentMethodTitle(
  providerId: string,
  map: Record<string, { title: string }>
): string {
  return map[providerId]?.title ?? providerId
}
