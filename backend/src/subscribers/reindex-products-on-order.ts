import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { productIdsFromOrder } from "../lib/order-product-ids"

/**
 * Re-index the products an order touched, so search stops advertising stock
 * that a customer just bought (WB-128).
 *
 * The gap: `@rokmohar/medusa-plugin-meilisearch` subscribes ONLY to
 * `product.created` / `product.updated` / `product.deleted` /
 * `product-category.*` and its own `meilisearch.sync` (verified against the
 * installed plugin's subscribers). A purchase writes INVENTORY LEVELS through
 * a different module and emits no product event, so the index never hears
 * about it. WB-100 documented this same blind spot for the vendor stock pass
 * and closed it there; this closes it for customer purchases.
 *
 * Before this, the only backstop a purchase could rely on was the daily 04:00
 * `meilisearch-reconcile-tick` — the 3-hourly vendor stock tick reconciles
 * only when the FEED changed quantities, which buying something does not. So
 * the index could show "in stock" for up to ~24 hours after the last unit
 * sold. Not yet observable in production (sampled 40 in-stock-flagged products
 * on 2026-07-30: all 40 genuinely buyable) purely because there is no real
 * order volume — it is latent, and it starts biting the day sales flow.
 *
 * Emitting `product.updated` is deliberate rather than calling the plugin
 * directly: it is the plugin's own documented entry point, it re-indexes ONE
 * product per event, and it keeps this subscriber independent of the plugin's
 * internals. No other subscriber in this codebase listens to `product.updated`.
 *
 * Restock paths are covered too — a cancellation or a received return puts
 * units back, and the index would otherwise keep showing the product as sold
 * out until the nightly reconcile.
 *
 * Never throws: a re-index failure must not fail the order event and risk the
 * event bus retrying a completed purchase. Failures are logged through the
 * Medusa logger (WB-119's lesson — a swallow that says nothing is
 * indistinguishable from success).
 */
export default async function reindexProductsOnOrder({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderId = event.data?.id

  try {
    const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)
    const order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items"],
    })

    const productIds = productIdsFromOrder(order as any)
    if (!productIds.length) {
      logger.warn(
        `[reindex-on-order] ${event.name} for order ${orderId} resolved no product ids — search may show stale stock until the nightly reconcile.`
      )
      return
    }

    const eventBus = container.resolve(Modules.EVENT_BUS)
    await eventBus.emit(
      productIds.map((id) => ({ name: "product.updated", data: { id } }))
    )

    logger.info(
      `[reindex-on-order] ${event.name}: requested re-index of ${productIds.length} product(s) for order ${orderId}`
    )
  } catch (err: any) {
    logger.error(
      `[reindex-on-order] failed to re-index products for order ${orderId} (${event.name}): ${
        err?.message ?? err
      } — search may show stale stock until the nightly reconcile.`
    )
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled", "order.return_received"],
}
