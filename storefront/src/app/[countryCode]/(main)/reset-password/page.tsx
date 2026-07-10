import { Metadata } from "next"

import ResetPassword from "@modules/account/components/reset-password"

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your Wheel Builds account.",
}

type ResetPasswordPageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ token?: string; email?: string }>
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: ResetPasswordPageProps) {
  const { countryCode } = await params
  const { token = "", email = "" } = await searchParams

  return (
    <div className="w-full flex justify-start px-8 py-8">
      <ResetPassword token={token} email={email} countryCode={countryCode} />
    </div>
  )
}
