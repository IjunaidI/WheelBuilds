/**
 * Pure idempotency helpers (WB-016). A retry must not re-create products or
 * variants left behind by a prior failed attempt.
 */

/** Partition records into those whose SKU (== partNumber) already exists. */
export function partitionRecordsBySku<T extends { partNumber: string }>(
  records: T[],
  existingSkus: Set<string>
): { toCreate: T[]; toAdopt: T[] } {
  const toCreate: T[] = []
  const toAdopt: T[] = []
  for (const r of records) {
    if (existingSkus.has(r.partNumber)) toAdopt.push(r)
    else toCreate.push(r)
  }
  return { toCreate, toAdopt }
}

/** Index a product's variants by SKU -> { variantId, inventoryItemId }. */
export function indexVariantsBySku(
  variants: any[]
): Map<string, { variantId: string; inventoryItemId: string | null }> {
  const m = new Map<string, { variantId: string; inventoryItemId: string | null }>()
  for (const v of variants ?? []) {
    if (!v?.sku) continue
    m.set(v.sku, {
      variantId: v.id,
      inventoryItemId: v.inventory_items?.[0]?.inventory_item_id ?? null,
    })
  }
  return m
}
