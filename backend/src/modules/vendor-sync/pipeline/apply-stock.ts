import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { batchInventoryItemLevelsWorkflow } from "@medusajs/medusa/core-flows"
import { ensureStockLocation } from "./bootstrap"
import VendorSyncService from "../service"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

export interface StockCreate {
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
}

export interface StockUpdate {
  id: string
  inventory_item_id: string
  location_id: string
  stocked_quantity: number
}

export interface StockChanges {
  creates: StockCreate[]
  updates: StockUpdate[]
}

/**
 * Pure function that computes inventory level creates/updates given:
 * - currentStaging: warehouse stock rows from the current feed
 * - previousStock: stockByWarehouse from vendor_product_current.normalized
 * - existingLevels: already-existing Medusa inventory levels keyed by location_id
 * - warehouseToLocationMap: warehouse_code -> Medusa stock_location_id
 * - inventoryItemId: the inventory item to operate on
 */
export function computeStockChanges(
  currentStaging: Array<{ warehouse_code: string; qoh: number }>,
  previousStock: Record<string, number>,
  existingLevels: Map<string, { id: string; stocked_quantity: number }>,
  warehouseToLocationMap: Map<string, string>,
  inventoryItemId: string
): StockChanges {
  const creates: StockCreate[] = []
  const updates: StockUpdate[] = []

  // Track which warehouse codes we've seen in current staging
  const seenWarehouseCodes = new Set<string>()

  // Process current staging rows
  for (const row of currentStaging) {
    seenWarehouseCodes.add(row.warehouse_code)
    const locationId = warehouseToLocationMap.get(row.warehouse_code)
    if (!locationId) continue

    const existing = existingLevels.get(locationId)
    if (existing) {
      // Only update if quantity changed
      if (existing.stocked_quantity !== row.qoh) {
        updates.push({
          id: existing.id,
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          stocked_quantity: row.qoh,
        })
      }
    } else {
      creates.push({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        stocked_quantity: row.qoh,
      })
    }
  }

  // Zero out warehouses that previously had stock but are now missing
  for (const warehouseCode of Object.keys(previousStock)) {
    if (seenWarehouseCodes.has(warehouseCode)) continue
    if ((previousStock[warehouseCode] ?? 0) === 0) continue

    const locationId = warehouseToLocationMap.get(warehouseCode)
    if (!locationId) continue

    const existing = existingLevels.get(locationId)
    if (existing) {
      if (existing.stocked_quantity !== 0) {
        updates.push({
          id: existing.id,
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          stocked_quantity: 0,
        })
      }
    } else {
      creates.push({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        stocked_quantity: 0,
      })
    }
  }

  return { creates, updates }
}

/**
 * Apply stock levels for a list of part numbers after product upserts.
 * For each part number:
 *   1. Look up inventory_item_id from vendor_product_current
 *   2. Query stock staging rows for this run
 *   3. Ensure stock locations exist for each warehouse
 *   4. Compute creates/updates via computeStockChanges
 *   5. Call batchInventoryItemLevelsWorkflow
 *
 * Each product is wrapped in try/catch so one failure doesn't block others.
 */
export async function applyStockLevels(
  container: MedusaContainer,
  service: VendorSyncService,
  runId: string,
  vendorCode: string,
  partNumbers: string[],
  salesChannelId: string,
  logger: Logger
): Promise<{ updatedCount: number; errorCount: number }> {
  const warehouseLocationCache = new Map<string, string>()
  const inventoryService = container.resolve(Modules.INVENTORY)

  let updatedCount = 0
  let errorCount = 0

  for (const partNumber of partNumbers) {
    try {
      // 1. Get inventory_item_id from vendor_product_current
      const [currentRow] = await (service as any).listVendorProductCurrents(
        { vendor_code: vendorCode, part_number: partNumber },
        { take: 1 }
      )
      if (!currentRow?.inventory_item_id) {
        logger.warn(
          `[vendor-sync] [${runId}] Skipping stock for ${partNumber}: no inventory_item_id`
        )
        continue
      }

      const inventoryItemId = currentRow.inventory_item_id

      // 2. Get stock staging rows for this part number in this run
      const stockStagingRows = await (service as any).listVendorStockStagings(
        { run_id: runId, part_number: partNumber },
        { take: null }
      )

      // 3. Ensure stock locations for each unique warehouse code
      const warehouseCodes = new Set<string>(
        stockStagingRows.map((r: any) => r.warehouse_code)
      )
      // Also include previous warehouse codes so we can zero them out
      const previousStock: Record<string, number> =
        (currentRow.normalized as any)?.stockByWarehouse ?? {}
      for (const wc of Object.keys(previousStock)) {
        warehouseCodes.add(wc)
      }

      const warehouseToLocationMap = new Map<string, string>()
      for (const wc of warehouseCodes) {
        const locationId = await ensureStockLocation(
          container,
          wc,
          salesChannelId,
          warehouseLocationCache
        )
        warehouseToLocationMap.set(wc, locationId)
      }

      // 4. Get existing inventory levels for this inventory item
      const existingLevelsRaw = await inventoryService.listInventoryLevels(
        { inventory_item_id: inventoryItemId },
        { take: null }
      )
      const existingLevels = new Map<
        string,
        { id: string; stocked_quantity: number }
      >()
      for (const level of existingLevelsRaw) {
        existingLevels.set(level.location_id, {
          id: level.id,
          stocked_quantity: level.stocked_quantity,
        })
      }

      // 5. Compute changes
      const changes = computeStockChanges(
        stockStagingRows.map((r: any) => ({
          warehouse_code: r.warehouse_code,
          qoh: r.qoh,
        })),
        previousStock,
        existingLevels,
        warehouseToLocationMap,
        inventoryItemId
      )

      // 6. Apply if there are changes
      if (changes.creates.length > 0 || changes.updates.length > 0) {
        await batchInventoryItemLevelsWorkflow(container).run({
          input: {
            create: changes.creates,
            update: changes.updates,
            delete: [],
            force: false,
          },
        })
        updatedCount++
      }
    } catch (err: any) {
      logger.error(
        `[vendor-sync] [${runId}] Error applying stock for ${partNumber}: ${err.message}`
      )
      errorCount++
    }
  }

  return { updatedCount, errorCount }
}
