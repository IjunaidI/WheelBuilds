import { ReactNode } from 'react'
import { MedusaError } from '@medusajs/framework/utils'
import { InviteUserEmail, INVITE_USER, isInviteUserData } from './invite-user'
import { OrderPlacedTemplate, ORDER_PLACED, isOrderPlacedTemplateData } from './order-placed'
import { OrderCanceledTemplate, ORDER_CANCELED, isOrderCanceledData } from './order-canceled'
import { ShippingConfirmationTemplate, SHIPPING_CONFIRMATION, isShippingConfirmationData } from './shipping-confirmation'
import { PasswordResetTemplate, PASSWORD_RESET, isPasswordResetData } from './password-reset'
import { VendorSyncAlertTemplate, VENDOR_SYNC_ALERT, isVendorSyncAlertData } from './vendor-sync-alert'

export const EmailTemplates = {
  INVITE_USER,
  ORDER_PLACED,
  ORDER_CANCELED,
  SHIPPING_CONFIRMATION,
  PASSWORD_RESET,
  VENDOR_SYNC_ALERT
} as const

export type EmailTemplateType = keyof typeof EmailTemplates

export function generateEmailTemplate(templateKey: string, data: unknown): ReactNode {
  switch (templateKey) {
    case EmailTemplates.INVITE_USER:
      if (!isInviteUserData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.INVITE_USER}"`
        )
      }
      return <InviteUserEmail {...data} />

    case EmailTemplates.ORDER_PLACED:
      if (!isOrderPlacedTemplateData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.ORDER_PLACED}"`
        )
      }
      return <OrderPlacedTemplate {...data} />

    case EmailTemplates.ORDER_CANCELED:
      if (!isOrderCanceledData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.ORDER_CANCELED}"`
        )
      }
      return <OrderCanceledTemplate {...data} />

    case EmailTemplates.SHIPPING_CONFIRMATION:
      if (!isShippingConfirmationData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.SHIPPING_CONFIRMATION}"`
        )
      }
      return <ShippingConfirmationTemplate {...data} />

    case EmailTemplates.PASSWORD_RESET:
      if (!isPasswordResetData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.PASSWORD_RESET}"`
        )
      }
      return <PasswordResetTemplate {...data} />

    case EmailTemplates.VENDOR_SYNC_ALERT:
      if (!isVendorSyncAlertData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.VENDOR_SYNC_ALERT}"`
        )
      }
      return <VendorSyncAlertTemplate {...data} />

    default:
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown template key: "${templateKey}"`
      )
  }
}

export { InviteUserEmail, OrderPlacedTemplate, OrderCanceledTemplate, ShippingConfirmationTemplate, PasswordResetTemplate, VendorSyncAlertTemplate }
