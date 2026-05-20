import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"
import { applyStockLevels } from "../modules/vendor-sync/pipeline/apply-stock"
import { ensureDefaultSalesChannel } from "../modules/vendor-sync/pipeline/bootstrap"

/**
 * One-off recovery script for products created before the apply.ts fix
 * that extracts inventory_item_id from the variant via query.graph.
 *
 * For every vendor_product_current row with a null inventory_item_id:
 *  1. Look up the variant's inventory_item_id via query.graph.
 *  2. Write it back to vendor_product_current.
 *  3. Group remaining part_numbers by (vendor_code, last_seen_run_id) and
 *     call applyStockLevels so the stock for those SKUs lands at last.
 */
export default async function vendorSyncBackfillInventory({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any

  logger.info("[backfill] Finding vendor_product_current rows with null inventory_item_id...")
  const rows = await service.listVendorProductCurrents(
    { inventory_item_id: null },
    { take: null }
  )
  logger.info(`[backfill] Found ${rows.length} rows to repair`)

  if (rows.length === 0) {
    logger.info("[backfill] Nothing to do")
    return
  }

  let fixedCount = 0
  let stillBrokenCount = 0
  const fixedByRun = new Map<string, { vendorCode: string; partNumbers: string[] }>()

  for (const row of rows) {
    if (!row.medusa_variant_id) {
      logger.warn(
        `[backfill] No medusa_variant_id for ${row.vendor_code}/${row.part_number}; skipping`
      )
      stillBrokenCount++
      continue
    }

    let inventoryItemId: string | null = null
    try {
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["id", "inventory_items.inventory_item_id"],
        filters: { id: [row.medusa_variant_id] },
      })
      inventoryItemId =
        (variants?.[0] as any)?.inventory_items?.[0]?.inventory_item_id ?? null
    } catch (err: any) {
      logger.error(
        `[backfill] query.graph failed for variant=${row.medusa_variant_id}: ${err.message}`
      )
      stillBrokenCount++
      continue
    }

    if (!inventoryItemId) {
      logger.warn(
        `[backfill] No inventory_item linked to variant=${row.medusa_variant_id} (${row.vendor_code}/${row.part_number})`
      )
      stillBrokenCount++
      continue
    }

    await service.updateVendorProductCurrents({
      id: row.id,
      inventory_item_id: inventoryItemId,
    })
    fixedCount++

    const runId = row.last_seen_run_id
    if (runId) {
      const bucket = fixedByRun.get(runId) ?? {
        vendorCode: row.vendor_code,
        partNumbers: [] as string[],
      }
      bucket.partNumbers.push(row.part_number)
      fixedByRun.set(runId, bucket)
    } else {
      logger.warn(
        `[backfill] ${row.vendor_code}/${row.part_number} has no last_seen_run_id; can't re-apply stock automatically`
      )
    }
  }

  logger.info(
    `[backfill] Updated inventory_item_id on ${fixedCount} rows (still broken: ${stillBrokenCount})`
  )

  if (fixedByRun.size === 0) {
    logger.info("[backfill] No part_numbers to re-stock")
    return
  }

  logger.info("[backfill] Bootstrapping sales channel for stock locations...")
  const salesChannelId = await ensureDefaultSalesChannel(container)

  for (const [runId, bucket] of fixedByRun.entries()) {
    logger.info(
      `[backfill] Applying stock for ${bucket.partNumbers.length} SKUs from run ${runId} (${bucket.vendorCode})`
    )
    const result = await applyStockLevels(
      container,
      service,
      runId,
      bucket.vendorCode,
      bucket.partNumbers,
      salesChannelId,
      logger
    )
    logger.info(
      `[backfill] Stock applied for run ${runId}: ${result.updatedCount} updated, ${result.errorCount} errors`
    )
  }

  logger.info("[backfill] Done")
}
