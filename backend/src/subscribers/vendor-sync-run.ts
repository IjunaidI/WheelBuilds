import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

/**
 * Runs vendor-sync apply work OFF the HTTP request. The admin routes emit
 * these events and return immediately; this subscriber executes on the global
 * container (which — unlike the module cradle `this.container_` — can resolve
 * the core product/inventory/region modules the apply workflows need).
 */
export default async function vendorSyncRunSubscriber({
  event,
  container,
}: SubscriberArgs<any>) {
  const service = container.resolve(VENDOR_SYNC_MODULE) as any
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { name } = event
  const data = event.data ?? {}
  try {
    if (name === "vendor-sync.execute") {
      await service.executeRun(data.runId, data.vendorCode, {
        container,
        dryRun: data.dryRun,
      })
    } else if (name === "vendor-sync.approve") {
      await service.approveAndApply(data.runId, data.actorId, container)
    } else if (name === "vendor-sync.replay") {
      await service.replayRun(data.runId, container)
    } else if (name === "vendor-sync.replay-sku") {
      await service.replaySku(data.vendorCode, data.partNumber, container)
    }
  } catch (err: any) {
    logger.error(`[vendor-sync-subscriber] ${name} failed: ${err?.message}`)
  }
}

export const config: SubscriberConfig = {
  event: [
    "vendor-sync.execute",
    "vendor-sync.approve",
    "vendor-sync.replay",
    "vendor-sync.replay-sku",
  ],
}
