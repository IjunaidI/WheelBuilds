import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { INotificationModuleService, IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO, IS_PRODUCTION, STOREFRONT_URL } from '../lib/constants'
import { isLocalhostUrl } from '../lib/is-localhost-url'

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const notificationModuleService: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, { relations: ['items', 'summary', 'shipping_address'] })
  const shippingAddress = await (orderModuleService as any).orderAddressService_.retrieve(order.shipping_address.id)

  // STOREFRONT_URL silently defaults to http://localhost:8000 (lib/constants.ts)
  // when unset. That's fine in dev, but in production it means the "View your
  // order" link in this email is dead — and for a guest checkout, that link is
  // their ONLY route back to the order. Don't hard-fail the send — just make
  // it loud in the logs (mirrors auth-password-reset.ts).
  if (IS_PRODUCTION && isLocalhostUrl(STOREFRONT_URL)) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `STOREFRONT_URL is unset/localhost ("${STOREFRONT_URL}") in production — ` +
        'order confirmation emails will link back to a dead URL. Set STOREFRONT_URL to the public storefront origin.'
    )
  }

  const orderUrl = `${STOREFRONT_URL}/order/confirmed/${order.id}`

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: 'email',
      template: EmailTemplates.ORDER_PLACED,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: 'Your order has been placed'
        },
        order,
        shippingAddress,
        orderUrl,
        preview: 'Thank you for your order!'
      }
    })
  } catch (error) {
    console.error('Error sending order confirmation notification:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed'
}
