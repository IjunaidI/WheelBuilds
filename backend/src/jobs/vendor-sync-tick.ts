import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

export default async function vendorSyncTick(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any

  const enabledVendors: string[] = service.listEnabledVendors()

  if (enabledVendors.length === 0) {
    logger.info("[vendor-sync-tick] No enabled vendors, skipping")
    return
  }

  for (const vendorCode of enabledVendors) {
    try {
      logger.info(
        `[vendor-sync-tick] Starting sync for vendor: ${vendorCode}`
      )
      await service.run(vendorCode)
      logger.info(
        `[vendor-sync-tick] Completed sync for vendor: ${vendorCode}`
      )
    } catch (err: any) {
      logger.error(
        `[vendor-sync-tick] Failed sync for vendor: ${vendorCode} — ${err.message}`
      )
    }
  }
}

export const config = {
  name: "vendor-sync-tick",
  schedule: "0 */12 * * *",
}
