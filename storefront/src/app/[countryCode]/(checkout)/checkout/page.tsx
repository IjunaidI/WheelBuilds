import { Metadata } from "next"
import { redirect } from "next/navigation"

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import EmptyCart from "@modules/checkout/templates/empty-cart"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { getCustomer } from "@lib/data/customer"
import { clampStep } from "@modules/checkout/utils/furthest-allowed-step"

export const metadata: Metadata = {
  title: "Checkout",
}

const fetchCart = async () => {
  const cart = await retrieveCart()
  if (!cart) return null

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart?.items, cart?.region_id!)
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  return cart
}

export default async function Checkout({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const { countryCode } = await params
  const { step } = await searchParams

  const cart = await fetchCart()

  // WB-092 C11: clamp a deep-linked `?step=` to the furthest step the cart
  // state actually allows. Previously only a MISSING step redirected (to
  // "address") -- an out-of-order `?step=payment` with no address on file
  // rendered Payment fully open while the Address section showed neither a
  // summary nor an Edit control, an inert dead end. Steps at or behind the
  // furthest allowed one (e.g. clicking a completed section's Edit button)
  // still pass through unchanged.
  const clampedStep = clampStep(step, cart)
  if (clampedStep !== step) {
    redirect(`/${countryCode}/checkout?step=${clampedStep}`)
  }

  const customer = await getCustomer()

  // Empty cart / no active cart: render the WB empty state instead of 404.
  // Real cart wiring on the PDP will populate a cart before the user lands
  // here, but direct-navigation and post-purchase clears need a soft landing.
  if (!cart || !cart.items?.length) {
    return <EmptyCart />
  }

  const firstName = customer?.first_name
  const isReturning = Boolean(customer)

  return (
    <div
      className="min-h-screen px-5 small:px-10 pb-14"
      style={{ background: "var(--soft)" }}
    >
      <div className="grid grid-cols-1 small:grid-cols-[1fr_420px] gap-10 small:gap-12 py-8 small:py-10 max-w-[1320px] mx-auto">
        <div className="min-w-0">
          <div className="mb-8 small:mb-10">
            <Label tone="accent" style={{ marginBottom: 10, display: "block" }}>
              SECURE CHECKOUT
            </Label>
            <Display size={40} as="h1" className="small:!text-[56px]">
              {isReturning && firstName
                ? `Welcome back, ${firstName}.`
                : "Checkout."}
            </Display>
            <p className="text-[14px] text-[var(--graphite)] mt-3 max-w-[480px] leading-[1.55]">
              {isReturning
                ? "Your saved info is loaded — confirm and go."
                : "We'll guarantee fitment, ship in 2–3 days, and back it all with a 30-day return."}
            </p>
          </div>
          <Wrapper cart={cart}>
            <CheckoutForm cart={cart} customer={customer} />
          </Wrapper>
        </div>
        <aside className="min-w-0">
          <CheckoutSummary cart={cart} />
        </aside>
      </div>
    </div>
  )
}
