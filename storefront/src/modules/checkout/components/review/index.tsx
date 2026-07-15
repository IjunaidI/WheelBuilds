"use client"

import { Heading, Text, clx } from "@medusajs/ui"
import { useEffect, useState } from "react"

import { checkStockAvailability } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ErrorMessage from "../error-message"
import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"

const Review = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const [stockError, setStockError] = useState<string | null>(null)

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const previousStepsCompleted =
    cart?.shipping_address &&
    (cart?.shipping_methods?.length ?? 0) > 0 &&
    (cart?.payment_collection || paidByGiftcard)

  // WB-092 C2: run the same stock preflight the payment buttons gate on, but
  // on MOUNT — so a customer who has drifted out of stock while shopping
  // sees the warning as soon as they reach Review, before they even click
  // Place order (the payment buttons re-check right before charging; this is
  // belt-and-suspenders visibility, not the enforcement point).
  useEffect(() => {
    let cancelled = false
    checkStockAvailability(cart).then((res) => {
      if (!cancelled) setStockError(res?.error ?? null)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.id])

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && (
        <ErrorMessage
          error={stockError}
          data-testid="stock-availability-error-message"
        />
      )}
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                By clicking the Place Order button, you confirm that you have
                read, understand and accept our{" "}
                <LocalizedClientLink
                  href="/terms"
                  className="underline underline-offset-2"
                >
                  Terms of Use, Terms of Sale
                </LocalizedClientLink>{" "}
                and{" "}
                <LocalizedClientLink
                  href="/returns"
                  className="underline underline-offset-2"
                >
                  Returns Policy
                </LocalizedClientLink>{" "}
                and acknowledge that you have read Wheel Builds&apos;{" "}
                <LocalizedClientLink
                  href="/privacy"
                  className="underline underline-offset-2"
                >
                  Privacy Policy
                </LocalizedClientLink>
                .
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
