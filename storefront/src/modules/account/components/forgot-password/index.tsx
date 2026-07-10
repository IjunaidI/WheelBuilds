"use client"

import { useFormState } from "react-dom"

import Input from "@modules/common/components/input"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { forgotPassword } from "@lib/data/customer"

const ForgotPassword = () => {
  const [state, formAction] = useFormState(forgotPassword, null)

  if (state === "SENT") {
    return (
      <div
        className="max-w-sm w-full flex flex-col items-center"
        data-testid="forgot-password-sent"
      >
        <h1 className="text-large-semi uppercase mb-6">Check your email</h1>
        <p className="text-center text-base-regular text-ui-fg-base mb-8">
          If that account exists, a password reset link is on its way.
        </p>
        <LocalizedClientLink href="/account" className="underline">
          Back to sign in
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div
      className="max-w-sm w-full flex flex-col items-center"
      data-testid="forgot-password-page"
    >
      <h1 className="text-large-semi uppercase mb-6">Reset your password</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-8">
        Enter the email associated with your account and we will send you a
        link to reset your password.
      </p>
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Enter a valid email address."
            autoComplete="email"
            required
            data-testid="email-input"
          />
        </div>
        <SubmitButton
          data-testid="send-reset-link-button"
          className="w-full mt-6"
        >
          Send reset link
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

export default ForgotPassword
