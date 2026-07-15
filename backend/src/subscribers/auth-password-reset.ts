import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO, IS_PRODUCTION, STOREFRONT_URL } from '../lib/constants'
import { isLocalhostUrl } from '../lib/is-localhost-url'

/**
 * Fires on `auth.password_reset`, emitted by `generateResetPasswordTokenWorkflow`
 * (@medusajs/core-flows, auth/workflows/generate-reset-password-token.js) via
 * `emitEventStep({ eventName: AuthWorkflowEvents.PASSWORD_RESET, data: { entity_id, actor_type, token, metadata } })`.
 * Verified against installed 2.13.6:
 *  - `AuthWorkflowEvents.PASSWORD_RESET === 'auth.password_reset'`
 *    (@medusajs/utils dist/core-flows/events.js:366).
 *  - The workflow is invoked by `POST /auth/:actor_type/:auth_provider/reset-password`
 *    (@medusajs/medusa dist/api/auth/[actor_type]/[auth_provider]/reset-password/route.js),
 *    which maps `entityId: identifier` (the emailpass identifier, i.e. the customer's
 *    email) and `actorType: actor_type` (the URL param — 'customer' for storefront
 *    resets, 'user' for admin resets) straight through to the emitted payload.
 * So `data.entity_id` is the email and `data.token` is the short-lived (15m) reset
 * JWT the storefront must pass back to `sdk.auth.updateProvider(...)`.
 */
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; actor_type?: string; token: string; metadata?: Record<string, unknown> }>) {
  // Only customers reset via the storefront link; admin/user resets use the admin app.
  if (data.actor_type && data.actor_type !== 'customer') {
    return
  }

  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const email = data.entity_id

  // STOREFRONT_URL silently defaults to http://localhost:8000 (lib/constants.ts)
  // when unset. That's fine in dev, but in production it means reset emails go
  // out with a dead link and nothing ever surfaces the misconfiguration. Don't
  // hard-fail the send — just make it loud in the logs.
  if (IS_PRODUCTION && isLocalhostUrl(STOREFRONT_URL)) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `STOREFRONT_URL is unset/localhost ("${STOREFRONT_URL}") in production — ` +
        'password-reset links will be broken for customers. Set STOREFRONT_URL to the public storefront origin.'
    )
  }

  const resetLink = `${STOREFRONT_URL}/us/reset-password?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(email)}`

  try {
    await notificationModuleService.createNotifications({
      to: email,
      channel: 'email',
      template: EmailTemplates.PASSWORD_RESET,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: 'Reset your Wheel Builds password'
        },
        resetLink,
        preview: 'Reset your Wheel Builds password'
      }
    })
  } catch (error) {
    console.error('Error sending password reset notification:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'auth.password_reset'
}
