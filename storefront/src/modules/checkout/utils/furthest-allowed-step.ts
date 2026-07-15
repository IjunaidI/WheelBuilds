export type CheckoutStep = "address" | "delivery" | "payment" | "review"

const STEP_ORDER: CheckoutStep[] = ["address", "delivery", "payment", "review"]

/**
 * A minimal, structurally-loose view of the cart fields this pure function
 * needs. Deliberately NOT `Pick<HttpTypes.StoreCart, ...>` -- the installed
 * @medusajs/types version doesn't declare `gift_cards` on `StoreCart` at all,
 * even though Medusa carts carry it at runtime (Payment/Review already read
 * `cart?.gift_cards` off cart props typed `any` for that same gap). A real
 * `HttpTypes.StoreCart` still satisfies this shape structurally, and tests
 * can pass small fixture objects instead of fully-shaped SDK types.
 */
export interface CartForStepClamp {
  shipping_address?: unknown | null
  shipping_methods?: { id?: string }[] | null
  payment_collection?: {
    payment_sessions?: { status?: string | null }[] | null
  } | null
  gift_cards?: unknown[] | null
  total?: number | null
}

/**
 * WB-092 C11: pure derivation of how far into checkout a cart has actually
 * progressed, independent of whatever `?step=` the URL asks for. Mirrors the
 * per-section "is this step done" checks already in Addresses/Shipping/
 * Payment/Review (shipping_address present, shipping_methods non-empty, an
 * active/pending payment session or a gift-card-covered total) so
 * `checkout/page.tsx` can clamp a deep-linked `?step=` server-side instead of
 * rendering an inert section -- e.g. `?step=payment` with no address on file
 * used to render Payment fully open while Address showed neither a summary
 * nor an Edit control to get back to it.
 */
export function furthestAllowedStep(
  cart: CartForStepClamp | null | undefined
): CheckoutStep {
  if (!cart?.shipping_address) {
    return "address"
  }

  if (!cart.shipping_methods?.length) {
    return "delivery"
  }

  const paidByGiftcard = Boolean(cart.gift_cards?.length) && cart.total === 0

  const hasPendingPaymentSession = Boolean(
    cart.payment_collection?.payment_sessions?.some(
      (session) => session?.status === "pending"
    )
  )

  if (!hasPendingPaymentSession && !paidByGiftcard) {
    return "payment"
  }

  return "review"
}

/**
 * Clamps a requested `?step=` value to the furthest step the cart actually
 * allows. Requested steps at or BEHIND the furthest one pass through
 * unchanged (going back to edit a completed step, e.g. via a section's Edit
 * button, must still work) -- only a request AHEAD of what the cart supports
 * (or an unrecognized/missing value) gets clamped down.
 */
export function clampStep(
  requestedStep: string | undefined,
  cart: CartForStepClamp | null | undefined
): CheckoutStep {
  const furthest = furthestAllowedStep(cart)

  if (!requestedStep) {
    return furthest
  }

  const requestedIndex = STEP_ORDER.indexOf(requestedStep as CheckoutStep)
  if (requestedIndex === -1) {
    return furthest
  }

  const furthestIndex = STEP_ORDER.indexOf(furthest)
  return requestedIndex <= furthestIndex ? (requestedStep as CheckoutStep) : furthest
}
