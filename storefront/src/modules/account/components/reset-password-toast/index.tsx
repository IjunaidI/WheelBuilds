"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"

/**
 * Fires a confirmation toast when the login screen is reached via
 * `?reset=1` — the redirect target of the resetPassword Server Action
 * (`lib/data/customer.ts`). Renders nothing; wrap in <Suspense> at the
 * call site (useSearchParams requirement, see product-detail's Hero).
 */
export default function ResetPasswordToast() {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("reset") === "1") {
      toast("Password reset. Sign in with your new password.")
    }
  }, [searchParams])

  return null
}
