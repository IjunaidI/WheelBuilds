import { INotificationModuleService, IUserModuleService } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { BACKEND_URL, EMAIL_REPLY_TO } from '../lib/constants'
import { EmailTemplates } from '../modules/email-notifications/templates'

export default async function userInviteHandler({
    event: { data },
    container,
  }: SubscriberArgs<any>) {

  const notificationModuleService: INotificationModuleService = container.resolve(
    Modules.NOTIFICATION,
  )
  const userModuleService: IUserModuleService = container.resolve(Modules.USER)
  const invite = await userModuleService.retrieveInvite(data.id)

  try {
    await notificationModuleService.createNotifications({
      to: invite.email,
      channel: 'email',
      template: EmailTemplates.INVITE_USER,
      data: {
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: "You've been invited to Wheel Builds"
        },
        inviteLink: `${BACKEND_URL}/app/invite?token=${invite.token}`,
        preview: 'The administration dashboard awaits...'
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
      `Failed to send admin invite email: ${error?.message ?? error}`
    )
  }
}

export const config: SubscriberConfig = {
  event: ['invite.created', 'invite.resent']
}
