import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { WHEEL_SIZE_MODULE } from "../modules/wheel-size"
import { resolveOptional } from "../lib/resolve-optional"
import { selectStaleForWarm } from "../modules/wheel-size/staleness"
import type WheelSizeService from "../modules/wheel-size/service"

export default async function wheelSizeWarm(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const svc = resolveOptional<WheelSizeService>(container, WHEEL_SIZE_MODULE)
  if (!svc) { logger.info("[wheel-size-warm] module not loaded, skipping"); return }

  const ttlDays = (svc as any).ttlDays_ ?? 90
  const batch = (svc as any).options_?.warmBatchSize ?? 200

  const rows = await (svc as any).listWheelSizeFitments({})
  // WB-077 I3: on the v2 cache-key cutover, every pre-existing row carries a v1
  // key. getFitment now looks up (and writes) under the v2 key, so those v1 rows
  // are dead — but they'd otherwise be re-warmed every night forever, burning
  // API quota. Skip them here so only live v2 rows consume the warm budget. The
  // required cleanup is truncating wheel_size_fitment post-deploy (see the plan's
  // Deploy section); this filter is the safety net if that's forgotten.
  const warmable = filterWarmableRows(rows as any[])
  const stale = selectStaleForWarm(warmable, ttlDays, new Date(), batch)
  logger.info(`[wheel-size-warm] ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"} to refresh (batch ${batch})`)

  let refreshed = 0
  for (const row of stale) {
    // Stop early if we are out of daily quota (each refresh costs ≥1 call).
    if (!(await svc.incrementAndCheckQuota())) { logger.warn("[wheel-size-warm] quota exhausted, stopping"); break }
    const p = parseCacheKey(row.cache_key)
    if (!p) continue
    try { await (svc as any).refreshFitment(p); refreshed++ }
    catch (e: any) { logger.warn(`[wheel-size-warm] refresh failed for ${row.cache_key}: ${e?.message ?? e}`) }
  }
  logger.info(`[wheel-size-warm] refreshed ${refreshed}/${stale.length}`)
}

// Exported for unit tests. cache_key = make|model|year|modificationSlug|region (5 slots, WB-072 B1),
// optionally followed by a WB-077 "v2" version slot (6 slots). The year is always present (as ""
// if not set), and the modificationSlug is in its own slot.
// This fixes B3: trim-keyed rows now carry the year, so the warm refresh no longer 400s.
export function parseCacheKey(
  key: string
): { make: string; model: string; modificationSlug?: string; year?: string; region: string } | null {
  const parts = String(key).split("|")
  if (parts.length < 5) return null // pre-B1 4-slot keys
  const [make, model, year, modificationSlug, region] = parts // ignore parts[5] ("v2") if present
  return {
    make, model,
    year: year || undefined,
    modificationSlug: modificationSlug || undefined,
    region,
  }
}

/**
 * A cache key is v2 (WB-077) iff it carries the trailing "|v2" version slot.
 * Rows without it are legacy single-trim rows written before the multi-trim
 * merge; getFitment looks them up under a v2 key and writes a fresh v2 row, so
 * the v1 row is orphaned. Exported for unit tests.
 */
export function isV2CacheKey(key: string): boolean {
  return String(key).endsWith("|v2")
}

/**
 * Keep only v2-keyed rows for warming — orphaned v1 rows are dead and must not
 * consume the nightly warm budget (WB-077 I3). Exported for unit tests.
 */
export function filterWarmableRows<T extends { cache_key: string }>(rows: T[]): T[] {
  return rows.filter((r) => isV2CacheKey(r.cache_key))
}

export const config = {
  name: "wheel-size-warm",
  schedule: "0 3 * * *",
}
