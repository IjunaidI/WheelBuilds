import { NormalizedRecord } from "../adapters/types"
import { pickGroupRepresentative } from "./wheel-grouping"

/**
 * Compute the surviving record set for a changed group: current members
 * minus any part_numbers removed in this apply pass (e.g. a dead-image row
 * dropped at staging, WB-115) AND minus any current row that was already
 * discontinued in a PRIOR pass, with entries overridden by their freshest
 * record wherever one was changed or (re-)added this run. This reconstructs
 * the same "what's actually still in the feed for this group" set the
 * create path starts from, so create and change agree on it.
 *
 * Regression fix (WB-115 thumbnail-recompute follow-up review):
 * `listCurrentRowsForGroup` fetches every historical row for a group_key
 * forever -- `group_key` is never cleared on discontinue. Excluding only
 * THIS pass's `removed_part_numbers` therefore let a row discontinued in run
 * N leak back into "survivors" on run N+1 (e.g. a routine price update on a
 * sibling finish that lands the group in `changed_part_numbers` again), and
 * if that stale row sorted lowest by part_number, `pickGroupRepresentative`
 * re-picked its dead image. A row's own `discontinued_at` must be checked
 * regardless of which pass set it.
 */
export function computeSurvivingGroupRecords(
  currentRows: Array<{
    part_number: string
    normalized: NormalizedRecord
    discontinued_at?: Date | string | null
  }>,
  updatedRecords: NormalizedRecord[],
  removedPartNumbers: string[]
): NormalizedRecord[] {
  const removed = new Set(removedPartNumbers)
  const byPart = new Map<string, NormalizedRecord>()
  for (const row of currentRows) {
    if (removed.has(row.part_number)) continue
    if (row.discontinued_at != null) continue
    byPart.set(row.part_number, row.normalized)
  }
  for (const r of updatedRecords) {
    byPart.set(r.partNumber, r)
  }
  return [...byPart.values()]
}

/**
 * Product-level thumbnail/images for a set of surviving group records, using
 * the SAME representative-selection + de-duped image-union rule as the
 * create path (pickGroupRepresentative + imageUrl union — see
 * applyNewWheelGroup / applyNewTireGroup in apply.ts) so create and change
 * never disagree on which image represents the product.
 *
 * Finding 1 (WB-115 final review): applyChangedGroup previously never
 * recomputed thumbnail/images, so a group that lost its representative
 * finish to a dead-image drop kept serving that dead URL even though the
 * variant itself was correctly flagged discontinued.
 */
export function computeGroupImageFields(survivors: NormalizedRecord[]): {
  thumbnail: string | undefined
  images: Array<{ url: string }>
} {
  if (survivors.length === 0) {
    return { thumbnail: undefined, images: [] }
  }
  const rep = pickGroupRepresentative(
    survivors as any
  ) as unknown as NormalizedRecord
  const imageUrls = Array.from(
    new Set(survivors.map((r) => r.imageUrl).filter((u): u is string => !!u))
  )
  return {
    thumbnail: rep.imageUrl ?? undefined,
    images: imageUrls.map((url) => ({ url })),
  }
}

/**
 * True when `computed` (the freshly recomputed thumbnail/images for a
 * changed group) actually differs from `current` (the product's live
 * values). Order-insensitive on `images` -- the URL union's iteration order
 * is not guaranteed stable between passes, so a same-set-different-order
 * result must NOT count as a change.
 *
 * Regression fix (WB-115 thumbnail-recompute follow-up review, finding 2):
 * applyChangedGroup previously called updateProductsWorkflow unconditionally
 * whenever any row survived, i.e. on essentially every changed group.
 * `@medusajs/core-flows`' update-products workflow independently emits
 * `ProductWorkflowEvents.UPDATED`, so combined with the pre-existing manual
 * `product.updated` emit for `touchedProductIds` this double-emitted the
 * reindex event and churned `updated_at` on products whose image fields
 * never moved -- a needless full-catalog Meilisearch reindex pressure on
 * every 12-hourly sync. Gate the write on this returning true.
 */
export function groupImageFieldsDiffer(
  current: {
    thumbnail?: string | null
    images?: Array<{ url: string }> | null
  },
  computed: { thumbnail: string | undefined; images: Array<{ url: string }> }
): boolean {
  const currentThumbnail = current.thumbnail ?? undefined
  if (currentThumbnail !== computed.thumbnail) {
    return true
  }

  const currentUrls = (current.images ?? []).map((i) => i.url)
  const computedUrls = computed.images.map((i) => i.url)
  if (currentUrls.length !== computedUrls.length) {
    return true
  }

  const currentUrlSet = new Set(currentUrls)
  return computedUrls.some((url) => !currentUrlSet.has(url))
}
