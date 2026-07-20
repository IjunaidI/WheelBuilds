import { NormalizedRecord } from "../adapters/types"
import { pickGroupRepresentative } from "./wheel-grouping"

/**
 * Compute the surviving record set for a changed group: current members
 * minus any part_numbers removed in this apply pass (e.g. a dead-image row
 * dropped at staging, WB-115), with entries overridden by their freshest
 * record wherever one was changed or (re-)added this run. This reconstructs
 * the same "what's actually still in the feed for this group" set the
 * create path starts from, so create and change agree on it.
 */
export function computeSurvivingGroupRecords(
  currentRows: Array<{ part_number: string; normalized: NormalizedRecord }>,
  updatedRecords: NormalizedRecord[],
  removedPartNumbers: string[]
): NormalizedRecord[] {
  const removed = new Set(removedPartNumbers)
  const byPart = new Map<string, NormalizedRecord>()
  for (const row of currentRows) {
    if (removed.has(row.part_number)) continue
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
