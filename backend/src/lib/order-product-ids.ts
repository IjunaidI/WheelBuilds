/**
 * The distinct product ids touched by an order (WB-128).
 *
 * Pure so the extraction is testable without a container or a live order —
 * the subscriber around it needs a DB and an event bus.
 */

type OrderLike = {
  items?: Array<{ product_id?: string | null; variant?: { product_id?: string | null } | null } | null> | null
}

/**
 * Cap on how many products one order can trigger a re-index for.
 *
 * A re-index is one Meilisearch upsert per product. A normal order touches a
 * handful; this only bounds a pathological order (or a bad payload) from
 * queueing hundreds of index writes at checkout time. Well above any real
 * wheel/tyre order.
 */
export const MAX_REINDEX_PER_ORDER = 50

export function productIdsFromOrder(order: OrderLike): string[] {
  const ids = new Set<string>()
  for (const item of order?.items ?? []) {
    // `product_id` is denormalised onto the line item, but fall back to the
    // expanded variant for payload shapes that only carry the relation.
    const id = item?.product_id ?? item?.variant?.product_id
    if (typeof id === "string" && id.length > 0) ids.add(id)
  }
  return Array.from(ids).slice(0, MAX_REINDEX_PER_ORDER)
}
