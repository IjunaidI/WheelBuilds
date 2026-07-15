"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { isNotFoundError } from "@lib/util/error-message"
import { cache } from "react"
import { getAuthHeaders } from "./cookies"

// WB-092 C8: `medusaError` always throws (its return type is `never`), so
// the old `.catch((err) => medusaError(err))` meant retrieveOrder NEVER
// resolved to null/undefined -- the confirmed page's `if (!order)
// notFound()` was dead code. A bad/foreign order id hit the generic
// `(main)/error.tsx` boundary instead of a real 404. Mirror retrieveCart's
// C3a fix: a genuine 404 -> null (so `notFound()` actually fires); a
// transport/5xx failure still rethrows (via medusaError, for its message
// extraction + logging) so a just-charged customer sees the boundary's
// reassurance copy instead of a silent, wrong 404.
export const retrieveOrder = cache(async function (id: string) {
  return sdk.store.order
    .retrieve(
      id,
      // WB-093 A4: gains `*fulfillments,*fulfillments.labels` so tracking
      // numbers/URLs (FulfillmentLabelDTO.tracking_number/tracking_url) are
      // actually present -- previously only payment_collections.payments
      // was requested, so no fulfillment/tracking data reached the account
      // order-detail or confirmation templates at all.
      { fields: "*payment_collections.payments,*fulfillments,*fulfillments.labels" },
      { next: { tags: ["order"] }, ...(await getAuthHeaders()) }
    )
    .then(({ order }) => order)
    .catch((err) => {
      if (isNotFoundError(err)) {
        return null
      }
      return medusaError(err)
    })
})

// WB-093 A6: previously resolved to a bare `orders` array, so a customer
// with more than `limit` (default 10) orders had no way to reach the 11th+
// -- it silently disappeared from the site with no pager and no signal that
// more existed. `sdk.store.order.list`'s response is a Medusa
// `PaginatedResponse` (`StoreOrderListResponse`) that already carries
// `count` (the real total, independent of how many rows this page
// returned) -- pass it through so callers can compute a page count. See
// `ordersPageParams` (./orders-page-params.ts) for the `{limit, offset}`
// math on the request side.
export const listOrders = cache(async function (
  limit: number = 10,
  offset: number = 0
) {
  return sdk.store.order
    .list({ limit, offset }, { next: { tags: ["order"] }, ...(await getAuthHeaders()) })
    .then(({ orders, count }) => ({ orders, count }))
    .catch((err) => medusaError(err))
})
