import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

export default async function vendorSyncStockTick(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any
  const enabledVendors: string[] = service.listEnabledVendors()
  if (enabledVendors.length === 0) {
    logger.info("[vendor-sync-stock-tick] No enabled vendors, skipping")
    return
  }
  for (const vendorCode of enabledVendors) {
    try {
      logger.info(`[vendor-sync-stock-tick] Stock refresh for vendor: ${vendorCode}`)
      await service.runStockOnly(vendorCode, { container })
    } catch (err: any) {
      logger.error(`[vendor-sync-stock-tick] Failed for ${vendorCode} — ${err.message}`)
    }
  }
}

export const config = {
  name: "vendor-sync-stock-tick",
  schedule: process.env.VENDOR_SYNC_STOCK_CRON || "0 */3 * * *",
}
