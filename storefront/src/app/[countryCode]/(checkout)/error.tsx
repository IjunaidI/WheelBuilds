"use client"

import { useEffect } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * WB-082: error boundary for the checkout flow. Outside `.frame`, so this uses
 * the legacy Tailwind idiom the checkout pages already use. The cart itself is
 * server-side — reloading the flow via /cart never loses the customer's items.
 */
export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[error-boundary:(checkout)]", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <h1 className="text-2xl-semi text-ui-fg-base mb-3">
        Checkout hit an unexpected error
      </h1>
      <p className="text-base-regular text-ui-fg-subtle max-w-[480px] mb-6">
        Your cart is safe. Try again — if it keeps happening, reopen checkout
        from your cart.{error.digest ? ` (Ref: ${error.digest})` : ""}
      </p>
      <div className="flex gap-4 items-center">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-ui-fg-base text-ui-bg-base rounded-md text-small-regular"
        >
          Try again
        </button>
        <LocalizedClientLink href="/cart" className="underline text-small-regular">
          Back to cart
        </LocalizedClientLink>
      </div>
    </div>
  )
}
