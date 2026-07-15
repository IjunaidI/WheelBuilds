import { Button, Link, Section, Text, Hr } from '@react-email/components'
import { Base } from './base'

/**
 * The key for the PasswordResetTemplate, used to identify it
 */
export const PASSWORD_RESET = 'password-reset'

/**
 * The props for the PasswordResetTemplate. `emailOptions` is part of the
 * shape sent to `createNotifications` (read directly by the notification
 * provider — see `services/resend.ts`), not consumed by the component itself.
 */
export interface PasswordResetData {
  emailOptions: Record<string, unknown>
  /**
   * The storefront link the customer clicks to set a new password.
   */
  resetLink: string
  /**
   * The preview text for the email, appears next to the subject
   * in mail providers like Gmail
   */
  preview?: string
}

/**
 * Type guard for checking if the data is of type PasswordResetData
 * @param data - The data to check
 */
export const isPasswordResetData = (data: any): data is PasswordResetData =>
  data && typeof data === 'object' && typeof data.resetLink === 'string'

/**
 * The PasswordResetTemplate component built with react-email
 */
export const PasswordResetTemplate = ({
  resetLink,
  preview = 'Reset your Wheel Builds password',
}: PasswordResetData) => {
  return (
    <Base preview={preview}>
      <Section className="mt-[32px] text-center">
        <Text className="text-black text-[14px] leading-[24px]">
          We received a request to reset your Wheel Builds password.
        </Text>
        <Section className="mt-4 mb-[32px]">
          <Button
            className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline px-5 py-3"
            href={resetLink}
          >
            Reset password
          </Button>
        </Section>
        <Text className="text-black text-[14px] leading-[24px]">
          or copy and paste this URL into your browser:
        </Text>
        <Text style={{
          maxWidth: '100%',
          wordBreak: 'break-all',
          overflowWrap: 'break-word'
        }}>
          <Link
            href={resetLink}
            className="text-blue-600 no-underline"
          >
            {resetLink}
          </Link>
        </Text>
      </Section>
      <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
      <Text className="text-[#666666] text-[12px] leading-[24px]">
        If you didn't request this, you can safely ignore this email — your password will
        not be changed. This link expires shortly.
      </Text>
    </Base>
  )
}

PasswordResetTemplate.PreviewProps = {
  resetLink: 'https://example.com/us/reset-password?token=abc&email=test%40example.com',
  preview: 'Reset your Wheel Builds password',
} as PasswordResetData

export default PasswordResetTemplate
