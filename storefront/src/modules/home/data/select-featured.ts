import type { DiscoveryProduct } from "../../discovery/data/types"

/**
 * Pure selection for Featured Blocks. `products` is the union of the
 * curated-by-handle results and the fallback candidates. Emit the curated
 * handles first (in given order, only those actually present), then backfill
 * with the remaining products in their given order. Dedup by product id and
 * cap to `limit`. Empty `curatedHandles` → the first `limit` of `products`.
 */
export function selectFeatured(
  products: DiscoveryProduct[],
  curatedHandles: string[],
  limit: number
): DiscoveryProduct[] {
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  const out: DiscoveryProduct[] = []
  const seen = new Set<string>()
  const push = (prod?: DiscoveryProduct) => {
    if (!prod || seen.has(prod.id)) return
    seen.add(prod.id)
    out.push(prod)
  }
  for (const h of curatedHandles) push(byHandle.get(h))
  for (const prod of products) push(prod)
  return out.slice(0, limit)
}
