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
      { fields: "*payment_collections.payments" },
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

export const listOrders = cache(async function (
  limit: number = 10,
  offset: number = 0
) {
  return sdk.store.order
    .list({ limit, offset }, { next: { tags: ["order"] }, ...(await getAuthHeaders()) })
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
})
