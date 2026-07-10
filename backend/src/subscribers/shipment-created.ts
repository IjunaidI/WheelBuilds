import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO } from '../lib/constants'

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
      'labels.tracking_number',
      'labels.tracking_url',
      'order.id',
      'order.display_id',
      'order.email',
      'order.items.title',
      'order.items.quantity',
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
        order,
        shippingAddress: order.shipping_address,
        trackingLinks: (fulfillment?.labels ?? []).map((l: any) => ({
          url: l.tracking_url,
          tracking_number: l.tracking_number,
        })),
        preview: 'Your order is on its way'
      }
    })
  } catch (error) {
    console.error('Error sending shipping confirmation notification:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'shipment.created'
}
