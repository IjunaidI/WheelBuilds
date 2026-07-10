"use client"

import { useFormState } from "react-dom"

import Input from "@modules/common/components/input"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { resetPassword } from "@lib/data/customer"

type Props = {
  token: string
  email: string
  countryCode: string
}

const ResetPassword = ({ token, email, countryCode }: Props) => {
  const [message, formAction] = useFormState(resetPassword, null)

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="reset-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Choose a new password</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Enter a new password for your account.
      </p>
      <form className="w-full" action={formAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="countryCode" value={countryCode} />
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            data-testid="password-input"
          />
          <Input
            label="Confirm password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            data-testid="confirm-password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="reset-password-error-message" />
        <SubmitButton data-testid="reset-password-button" className="w-full mt-6">
          Reset password
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        <LocalizedClientLink href="/account" className="underline">
          Back to sign in
        </LocalizedClientLink>
      </span>
    </div>
  )
}

export default ResetPassword
