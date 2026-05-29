export interface DiffResult {
  newPartNumbers: string[]
  changedPartNumbers: string[]
  discontinuedPartNumbers: string[]
}

export interface NewGroup {
  group_key: string
  part_numbers: string[]
}

export interface ChangedGroup {
  group_key: string
  added_part_numbers: string[]
  removed_part_numbers: string[]
  changed_part_numbers: string[]
}

export interface DiscontinuedGroup {
  group_key: string
  part_numbers: string[]
}

export interface GroupDiffResult {
  newGroups: NewGroup[]
  changedGroups: ChangedGroup[]
  discontinuedGroups: DiscontinuedGroup[]
}

/**
 * Pure diff computation: compare staging rows against current rows
 * and classify each part_number as new, changed, or discontinued.
 *
 * This function is intentionally pure (no I/O) so it can be unit-tested
 * without a database.
 */
export function computeDiffFromSets(
  stagingRows: Array<{ part_number: string; content_hash: string }>,
  currentRows: Array<{
    part_number: string
    content_hash: string
    discontinued_at: Date | null
  }>
): DiffResult {
  // Build lookup structures
  const stagingByPart = new Map<string, string>()
  for (const row of stagingRows) {
    stagingByPart.set(row.part_number, row.content_hash)
  }

  const activeCurrentByPart = new Map<string, string>()
  for (const row of currentRows) {
    if (row.discontinued_at === null) {
      activeCurrentByPart.set(row.part_number, row.content_hash)
    }
  }

  // New: in staging but not in active current
  const newPartNumbers: string[] = []
  // Changed: in both, content_hash differs
  const changedPartNumbers: string[] = []

  for (const [partNumber, stagingHash] of stagingByPart) {
    const currentHash = activeCurrentByPart.get(partNumber)
    if (currentHash === undefined) {
      newPartNumbers.push(partNumber)
    } else if (currentHash !== stagingHash) {
      changedPartNumbers.push(partNumber)
    }
  }

  // Discontinued: in active current but not in staging
  const discontinuedPartNumbers: string[] = []
  for (const partNumber of activeCurrentByPart.keys()) {
    if (!stagingByPart.has(partNumber)) {
      discontinuedPartNumbers.push(partNumber)
    }
  }

  return { newPartNumbers, changedPartNumbers, discontinuedPartNumbers }
}

/**
 * Compute diff by querying staging and current tables via the service,
 * then delegating to the pure computeDiffFromSets function.
 */
export async function computeDiff(
  service: any,
  runId: string,
  vendorCode: string
): Promise<DiffResult> {
  // Fetch all staging rows for this run.
  // MedusaService list methods accept filters and config with select/take.
  const stagingRows = await service.listVendorFeedStagings(
    { run_id: runId, vendor_code: vendorCode },
    { select: ["part_number", "content_hash"], take: null }
  )

  // Fetch all current rows for this vendor (including discontinued,
  // so we can filter in the pure function).
  const currentRows = await service.listVendorProductCurrents(
    { vendor_code: vendorCode },
    { select: ["part_number", "content_hash", "discontinued_at"], take: null }
  )

  return computeDiffFromSets(stagingRows, currentRows)
}

/**
 * Pure group-aware diff. Buckets staging and active-current rows by
 * group_key, then within each group classifies part_numbers as added,
 * removed, or changed.
 *
 * A group is:
 *  - NEW         when no active current row carries that group_key
 *                (the apply path creates one product with N variants)
 *  - DISCONTINUED when no staging row carries that group_key
 *                (the apply path drafts the product; all its variants are gone)
 *  - CHANGED      when the group has presence on both sides AND any of
 *                added/removed/changed is non-empty
 *                (the apply path reconciles variants only)
 *
 * Unchanged groups (present on both sides, no per-part deltas) are not
 * emitted.
 *
 * A part_number that moved between groups appears as `added` to its new
 * group and `removed` from its old group; if the old group had no other
 * part_numbers it becomes a discontinued group instead. Both behaviors
 * fall out of the bucket-then-classify approach without special casing.
 */
export function computeGroupDiffFromSets(
  stagingRows: Array<{
    part_number: string
    group_key: string
    content_hash: string
  }>,
  currentRows: Array<{
    part_number: string
    group_key: string
    content_hash: string
    discontinued_at: Date | null
  }>
): GroupDiffResult {
  const stagingByPart = new Map<
    string,
    { group_key: string; content_hash: string }
  >()
  for (const row of stagingRows) {
    stagingByPart.set(row.part_number, {
      group_key: row.group_key,
      content_hash: row.content_hash,
    })
  }

  const activeCurrentByPart = new Map<
    string,
    { group_key: string; content_hash: string }
  >()
  for (const row of currentRows) {
    if (row.discontinued_at === null) {
      activeCurrentByPart.set(row.part_number, {
        group_key: row.group_key,
        content_hash: row.content_hash,
      })
    }
  }

  const stagingPartsByGroup = new Map<string, string[]>()
  for (const [partNumber, info] of stagingByPart) {
    const list = stagingPartsByGroup.get(info.group_key) ?? []
    list.push(partNumber)
    stagingPartsByGroup.set(info.group_key, list)
  }

  const currentPartsByGroup = new Map<string, string[]>()
  for (const [partNumber, info] of activeCurrentByPart) {
    const list = currentPartsByGroup.get(info.group_key) ?? []
    list.push(partNumber)
    currentPartsByGroup.set(info.group_key, list)
  }

  const allGroupKeys = new Set<string>([
    ...stagingPartsByGroup.keys(),
    ...currentPartsByGroup.keys(),
  ])

  const newGroups: NewGroup[] = []
  const changedGroups: ChangedGroup[] = []
  const discontinuedGroups: DiscontinuedGroup[] = []

  for (const groupKey of allGroupKeys) {
    const stagingParts = stagingPartsByGroup.get(groupKey) ?? []
    const currentParts = currentPartsByGroup.get(groupKey) ?? []

    if (stagingParts.length === 0) {
      discontinuedGroups.push({
        group_key: groupKey,
        part_numbers: currentParts.slice().sort(),
      })
      continue
    }

    if (currentParts.length === 0) {
      newGroups.push({
        group_key: groupKey,
        part_numbers: stagingParts.slice().sort(),
      })
      continue
    }

    const currentSet = new Set(currentParts)
    const stagingSet = new Set(stagingParts)

    const added: string[] = []
    const removed: string[] = []
    const changed: string[] = []

    for (const partNumber of stagingParts) {
      if (!currentSet.has(partNumber)) {
        added.push(partNumber)
        continue
      }
      const stagingHash = stagingByPart.get(partNumber)?.content_hash
      const currentHash = activeCurrentByPart.get(partNumber)?.content_hash
      if (stagingHash !== currentHash) {
        changed.push(partNumber)
      }
    }

    for (const partNumber of currentParts) {
      if (!stagingSet.has(partNumber)) {
        removed.push(partNumber)
      }
    }

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
      continue
    }

    changedGroups.push({
      group_key: groupKey,
      added_part_numbers: added.sort(),
      removed_part_numbers: removed.sort(),
      changed_part_numbers: changed.sort(),
    })
  }

  return { newGroups, changedGroups, discontinuedGroups }
}

/**
 * Group-aware variant of computeDiff. Queries staging and current with
 * group_key included, then delegates to the pure function. The apply
 * path uses this; the older part-level computeDiff stays in place until
 * the apply rewrite lands.
 */
export async function computeGroupDiff(
  service: any,
  runId: string,
  vendorCode: string
): Promise<GroupDiffResult> {
  const stagingRows = await service.listVendorFeedStagings(
    { run_id: runId, vendor_code: vendorCode },
    {
      select: ["part_number", "group_key", "content_hash"],
      take: null,
    }
  )

  const currentRows = await service.listVendorProductCurrents(
    { vendor_code: vendorCode },
    {
      select: ["part_number", "group_key", "content_hash", "discontinued_at"],
      take: null,
    }
  )

  return computeGroupDiffFromSets(stagingRows, currentRows)
}
