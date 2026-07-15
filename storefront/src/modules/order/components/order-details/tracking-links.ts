/**
 * WB-093 A4: the storefront's pinned `@medusajs/types` predates the
 * fulfillment `labels` relation -- `StoreOrderFulfillment` (which
 * `HttpTypes.StoreOrder["fulfillments"]` resolves to) doesn't declare a
 * `labels` field, even though the backend's `FulfillmentDTO` carries
 * `labels: FulfillmentLabelDTO[]` and `retrieveOrder`'s `fields` now
 * requests `*fulfillments,*fulfillments.labels`. Rather than fight the stale
 * .d.ts with an `any` cast, this module declares its own narrow shape for
 * just the properties it reads. Because `labels` is OPTIONAL on
 * `FulfillmentLike`, the real (label-less-typed) `StoreOrderFulfillment[]`
 * is still structurally assignable at the call site -- no cast needed there
 * either.
 */
export type FulfillmentLabelLike = {
  tracking_number?: string | null
  tracking_url?: string | null
}

export type FulfillmentLike = {
  labels?: FulfillmentLabelLike[] | null
}

export type TrackingLink = {
  number: string
  url?: string
}

/**
 * Flattens every label off every fulfillment into a single tracking-link
 * list, in fulfillment order. A label without a tracking number is skipped
 * (nothing to show); a label without a tracking URL still surfaces its
 * number as plain text rather than being dropped.
 */
export function trackingLinks(
  fulfillments?: FulfillmentLike[] | null
): TrackingLink[] {
  if (!fulfillments?.length) {
    return []
  }

  const links: TrackingLink[] = []

  for (const fulfillment of fulfillments) {
    for (const label of fulfillment?.labels ?? []) {
      if (!label?.tracking_number) {
        continue
      }
      links.push(
        label.tracking_url
          ? { number: label.tracking_number, url: label.tracking_url }
          : { number: label.tracking_number }
      )
    }
  }

  return links
}
