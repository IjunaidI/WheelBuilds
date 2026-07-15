"use client"

import { useRouter } from "next/navigation"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"

/**
 * WB-092 C3b: rendered by <CheckoutForm> instead of `return null` when the
 * shipping/payment options fetch fails. A `null` render handed the customer
 * a blank checkout page mid-flow with zero explanation -- indistinguishable
 * from a broken build. Their cart and address entries are untouched (the
 * cart itself lives server-side), so this only needs to explain the hiccup
 * and offer a retry, mirroring the discovery/tire-discovery outage blocks'
 * `router.refresh()` pattern (re-runs the server component tree in place,
 * no full reload).
 */
const CheckoutLoadError = () => {
  const router = useRouter()

  return (
    <div
      className="flex flex-col items-center text-center py-16 px-6 gap-4 rounded-lg"
      style={{ border: "1px dashed var(--hairline)" }}
    >
      <Label tone="muted">CHECKOUT · TEMPORARILY UNAVAILABLE</Label>
      <Display size={28} as="h2">
        We couldn&apos;t load delivery &amp; payment options
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[420px]">
        This is a hiccup on our end, not anything you did -- your cart is
        untouched. Please try again.
      </p>
      <Button onClick={() => router.refresh()} className="mt-2">
        Retry
      </Button>
    </div>
  )
}

export default CheckoutLoadError
