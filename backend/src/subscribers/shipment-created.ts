import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO, IS_PRODUCTION, STOREFRONT_URL } from '../lib/constants'
import { isLocalhostUrl } from '../lib/is-localhost-url'

/**
 * Fires on `shipment.created`, emitted by `createOrderShipmentWorkflow`
 * (@medusajs/core-flows, order/workflows/create-shipment.ts) via
 * `emitEventStep({ eventName: FulfillmentWorkflowEvents.SHIPMENT_CREATED, data: { id, no_notification } })`.
 * `data.id` is the fulfillment id (the workflow's internal "shipment" value is
 * the updated Fulfillment record, not a separate Shipment entity), and
 * `data.no_notification` is the flag from the Create Shipment request body —
 * it is NOT a field on the fulfillment model, so it must be read from the
 * event payload rather than re-fetched via query.graph.
 */
export default async function shipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) {
    return
  }

  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: fulfillments } = await query.graph({
    entity: 'fulfillment',
    fields: [
      'id',
      'items.title',
      'items.quantity',
      'labels.tracking_number',
      'labels.tracking_url',
      'order.id',
      'order.display_id',
      'order.email',
      'order.shipping_address.first_name',
      'order.shipping_address.last_name',
      'order.shipping_address.address_1',
      'order.shipping_address.city',
      'order.shipping_address.province',
      'order.shipping_address.postal_code',
      'order.shipping_address.country_code',
    ],
    filters: { id: data.id },
  })

  const fulfillment = fulfillments?.[0]
  const order = fulfillment?.order as any

  if (!order?.email) {
    return
  }

  // Use THIS fulfillment's items, not the whole order — an order that ships in
  // multiple fulfillments (e.g. wheels then tires) must only list what shipped
  // in this shipment. FulfillmentItem carries `title`/`quantity` directly
  // (verified against installed @medusajs/fulfillment 2.13.6 — see
  // dist/models/fulfillment-item.js), so no join against order.items is needed.
  const shippedItems = (fulfillment?.items ?? []).map((item: any) => ({
    title: item.title,
    quantity: item.quantity,
  }))

  // STOREFRONT_URL silently defaults to http://localhost:8000 (lib/constants.ts)
  // when unset. That's fine in dev, but in production it means the "View your
  // order" link in this email is dead — and for a guest checkout, that link is
  // their ONLY route back to the order. Don't hard-fail the send — just make
  // it loud in the logs (mirrors auth-password-reset.ts).
  if (IS_PRODUCTION && isLocalhostUrl(STOREFRONT_URL)) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `STOREFRONT_URL is unset/localhost ("${STOREFRONT_URL}") in production — ` +
        'shipping confirmation emails will link back to a dead URL. Set STOREFRONT_URL to the public storefront origin.'
    )
  }

  const orderUrl = `${STOREFRONT_URL}/order/confirmed/${order.id}`

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: 'email',
      template: EmailTemplates.SHIPPING_CONFIRMATION,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: 'Your order has shipped'
        },
        order: { ...order, items: shippedItems },
        shippingAddress: order.shipping_address,
        trackingLinks: (fulfillment?.labels ?? []).map((l: any) => ({
          url: l.tracking_url,
          tracking_number: l.tracking_number,
        })),
        orderUrl,
        preview: 'Your order is on its way'
      }
    })
  } catch (error: any) {
    // WB-119 Q-19 — same blind spot as order-placed.ts: WB-094 made the
    // Resend provider THROW rather than silently record success, and a
    // console.error here threw that signal away, so a failed send was
    // invisible in production logs. Swallowed (not rethrown) on purpose: a
    // retry risks a duplicate send, which is worse than a missing message
    // that is loud in the logs.
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `Failed to send shipping confirmation email: ${error?.message ?? error}`
    )
  }
}

export const config: SubscriberConfig = {
  event: 'shipment.created'
}
