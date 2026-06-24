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
  const stale = selectStaleForWarm(rows as any[], ttlDays, new Date(), batch)
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

// cache_key = `${make}|${model}|${modificationSlug||year||""}|${region}`. The middle
// slot is opaque (trim slug OR year); pass it as modificationSlug — refreshFitment
// only uses it to rebuild the same cache_key, so the round-trip is exact.
function parseCacheKey(key: string): { make: string; model: string; modificationSlug?: string; region: string } | null {
  const parts = String(key).split("|")
  if (parts.length < 4) return null
  const [make, model, mid, region] = parts
  return { make, model, modificationSlug: mid || undefined, region }
}

export const config = {
  name: "wheel-size-warm",
  schedule: "0 3 * * *",
}
