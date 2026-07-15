import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { INotificationModuleService, IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO, IS_PRODUCTION, STOREFRONT_URL } from '../lib/constants'
import { isLocalhostUrl } from '../lib/is-localhost-url'

/**
 * Fires on `order.canceled`, emitted by `cancelOrderWorkflow`
 * (@medusajs/core-flows, order/workflows/cancel-order.js) via
 * `emitEventStep({ eventName: OrderWorkflowEvents.CANCELED, data: { id: order.id } })`.
 * Verified against installed 2.13.6 (@medusajs/utils dist/core-flows/events.js:
 * `OrderWorkflowEvents.CANCELED === "order.canceled"`). So `data.id` is the order id,
 * mirroring `order-placed.ts`'s payload shape.
 *
 * Honesty note (WB-094): the event payload carries only `{ id }` — no refund
 * amount or timeline. `cancelOrderWorkflow` DOES unconditionally refund any
 * captured payment as part of cancellation (via `refundCapturedPaymentsWorkflow`
 * + a matching credit line), so the template's hedged "if you were charged,
 * we'll refund it" line is true — but neither the payload nor this subscriber
 * has a concrete amount/ETA to report, so none is fabricated.
 */
export default async function orderCanceledHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const notificationModuleService: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, { relations: ['items', 'shipping_address'] })

  // Not every order is guaranteed to still resolve a shipping address record at
  // cancellation time (e.g. it was already removed) — degrade to no personalized
  // greeting rather than crashing the subscriber.
  let shippingAddress
  if (order.shipping_address?.id) {
    try {
      shippingAddress = await (orderModuleService as any).orderAddressService_.retrieve(order.shipping_address.id)
    } catch {
      shippingAddress = undefined
    }
  }

  // STOREFRONT_URL silently defaults to http://localhost:8000 (lib/constants.ts)
  // when unset. That's fine in dev, but in production it means the "View your
  // order" link in this email is dead — mirrors order-placed.ts / shipment-created.ts.
  if (IS_PRODUCTION && isLocalhostUrl(STOREFRONT_URL)) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `STOREFRONT_URL is unset/localhost ("${STOREFRONT_URL}") in production — ` +
        'order cancellation emails will link back to a dead URL. Set STOREFRONT_URL to the public storefront origin.'
    )
  }

  const orderUrl = `${STOREFRONT_URL}/order/confirmed/${order.id}`

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: 'email',
      template: EmailTemplates.ORDER_CANCELED,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: 'Your order has been canceled'
        },
        order,
        shippingAddress,
        orderUrl,
        preview: 'Your order has been canceled'
      }
    })
  } catch (error) {
    console.error('Error sending order cancellation notification:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'order.canceled'
}
