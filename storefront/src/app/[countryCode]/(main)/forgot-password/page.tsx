import { Metadata } from "next"

import ForgotPassword from "@modules/account/components/forgot-password"

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset the password for your Wheel Builds account.",
}

export default function ForgotPasswordPage() {
  return (
    <div className="w-full flex justify-start px-8 py-8">
      <ForgotPassword />
    </div>
  )
}
