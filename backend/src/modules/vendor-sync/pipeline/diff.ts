export interface DiffResult {
  newPartNumbers: string[]
  changedPartNumbers: string[]
  discontinuedPartNumbers: string[]
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
