"use client"

import React from "react"
import { useFormState } from "react-dom"

import { SubmitButton } from "@modules/checkout/components/submit-button"
import { forgotPassword } from "@lib/data/customer"
import { HttpTypes } from "@medusajs/types"

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

const ProfilePassword: React.FC<MyInformationProps> = ({ customer }) => {
  const [state, formAction] = useFormState(forgotPassword, null)

  return (
    <div className="w-full" data-testid="account-password-editor">
      <h3 className="text-large-semi">Password</h3>
      {state === "SENT" ? (
        <p className="text-base-regular mt-2">
          We&apos;ve emailed {customer.email} a link to reset your password.
        </p>
      ) : (
        <form action={formAction} className="mt-2 flex items-center gap-4">
          <input type="hidden" name="email" value={customer.email} />
          <p className="text-base-regular">
            Send a password reset link to {customer.email}.
          </p>
          <SubmitButton data-testid="send-reset-email-button">
            Send reset email
          </SubmitButton>
        </form>
      )}
    </div>
  )
}

export default ProfilePassword
