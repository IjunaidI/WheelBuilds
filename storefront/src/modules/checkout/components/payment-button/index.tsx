"use client"

import { Button } from "@medusajs/ui"
import { OnApproveActions, OnApproveData } from "@paypal/paypal-js"
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import React, { useState } from "react"
import { unstable_rethrow } from "next/navigation"
import ErrorMessage from "../error-message"
import Spinner from "@modules/common/icons/spinner"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { isManual, isPaypal, isStripe } from "@lib/constants"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  // TODO: Add this once gift cards are implemented
  // const paidByGiftcard =
  //   cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  // if (paidByGiftcard) {
  //   return <GiftCardPaymentButton />
  // }

  // WB-071 F-E: pick the pending session (matches payment/index.tsx's activeSession)
  // so the button that renders/charges matches the method the review shows.
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  switch (true) {
    case isStripe(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isManual(paymentSession?.provider_id):
      return process.env.NODE_ENV === "production" ? (
        <Button disabled>Select a payment method</Button>
      ) : (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    case isPaypal(paymentSession?.provider_id):
      return (
        <PayPalPaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    default:
      return <Button disabled>Select a payment method</Button>
  }
}

const GiftCardPaymentButton = () => {
  const [submitting, setSubmitting] = useState(false)

  const handleOrder = async () => {
    setSubmitting(true)
    await placeOrder()
  }

  return (
    <Button
      onClick={handleOrder}
      isLoading={submitting}
      data-testid="submit-order-button"
    >
      Place order
    </Button>
  )
}

const StripePaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    // WB-079 B2: placeOrder() RETURNS { error } on failure (Next redacts thrown
    // Server Action messages in prod) and navigates on success. F14: a genuine
    // transport/framework failure (e.g. a network drop mid-RPC) would otherwise
    // reject unhandled and leave the spinner stuck on a real payment — catch it,
    // but re-throw NEXT_REDIRECT/NEXT_NOT_FOUND untouched so the happy path is
    // unaffected.
    try {
      const res = await placeOrder()
      if (res?.error) {
        setErrorMessage(res.error)
        setSubmitting(false)
        return
      }
      // Success: placeOrder() already redirected. Nothing else to do.
    } catch (err) {
      unstable_rethrow(err)
      setErrorMessage("Something went wrong reaching our server. Please try again.")
      setSubmitting(false)
    }
  }

  const stripe = useStripe()
  const elements = useElements()
  const card = elements?.getElement("card")

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const disabled = !stripe || !elements ? true : false

  const handlePayment = async () => {
    setSubmitting(true)

    if (!stripe || !elements || !card || !cart) {
      setSubmitting(false)
      return
    }

    await stripe
      .confirmCardPayment(session?.data.client_secret as string, {
        payment_method: {
          card: card,
          billing_details: {
            name:
              cart.billing_address?.first_name +
              " " +
              cart.billing_address?.last_name,
            address: {
              city: cart.billing_address?.city ?? undefined,
              country: cart.billing_address?.country_code ?? undefined,
              line1: cart.billing_address?.address_1 ?? undefined,
              line2: cart.billing_address?.address_2 ?? undefined,
              postal_code: cart.billing_address?.postal_code ?? undefined,
              state: cart.billing_address?.province ?? undefined,
            },
            email: cart.email,
            phone: cart.billing_address?.phone ?? undefined,
          },
        },
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            onPaymentCompleted()
          }

          // Release the spinner on a declined/failed card — otherwise the
          // "Place order" button hangs in its loading state (F14 twin: same
          // stuck-spinner class, the confirmCardPayment branch).
          setSubmitting(false)
          setErrorMessage(error.message || null)
          return
        }

        if (
          (paymentIntent && paymentIntent.status === "requires_capture") ||
          paymentIntent.status === "succeeded"
        ) {
          return onPaymentCompleted()
        }

        // Unexpected intent status (still processing / requires_action, etc.):
        // release the spinner instead of hanging with no feedback.
        setSubmitting(false)
        setErrorMessage("Payment could not be confirmed. Please try again.")
        return
      })
      .catch((err) => {
        // A Stripe SDK / network failure rejects the confirm promise. Re-throw
        // framework navigation signals first (never swallow NEXT_REDIRECT),
        // then release the spinner + surface a generic message.
        unstable_rethrow(err)
        setSubmitting(false)
        setErrorMessage(
          err?.message ||
            "Something went wrong confirming your payment. Please try again."
        )
      })
  }

  return (
    <>
      <Button
        disabled={disabled || notReady}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  )
}

const PayPalPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    // WB-079 B2: placeOrder() RETURNS { error } on failure (Next redacts thrown
    // Server Action messages in prod) and navigates on success. F14: a genuine
    // transport/framework failure (e.g. a network drop mid-RPC) would otherwise
    // reject unhandled and leave the spinner stuck on a real payment — catch it,
    // but re-throw NEXT_REDIRECT/NEXT_NOT_FOUND untouched so the happy path is
    // unaffected.
    try {
      const res = await placeOrder()
      if (res?.error) {
        setErrorMessage(res.error)
        setSubmitting(false)
        return
      }
      // Success: placeOrder() already redirected. Nothing else to do.
    } catch (err) {
      unstable_rethrow(err)
      setErrorMessage("Something went wrong reaching our server. Please try again.")
      setSubmitting(false)
    }
  }

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const handlePayment = async (
    _data: OnApproveData,
    actions: OnApproveActions
  ) => {
    actions?.order
      ?.authorize()
      .then((authorization) => {
        if (authorization.status !== "COMPLETED") {
          setErrorMessage(`An error occurred, status: ${authorization.status}`)
          return
        }
        onPaymentCompleted()
      })
      .catch(() => {
        setErrorMessage(`An unknown error occurred, please try again.`)
        setSubmitting(false)
      })
  }

  const [{ isPending, isResolved }] = usePayPalScriptReducer()

  if (isPending) {
    return <Spinner />
  }

  if (isResolved) {
    return (
      <>
        <PayPalButtons
          style={{ layout: "horizontal" }}
          createOrder={async () => session?.data.id as string}
          onApprove={handlePayment}
          disabled={notReady || submitting || isPending}
          data-testid={dataTestId}
        />
        <ErrorMessage
          error={errorMessage}
          data-testid="paypal-payment-error-message"
        />
      </>
    )
  }
}

const ManualTestPaymentButton = ({ notReady }: { notReady: boolean }) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    // WB-079 B2: placeOrder() RETURNS { error } on failure (Next redacts thrown
    // Server Action messages in prod) and navigates on success. F14: a genuine
    // transport/framework failure (e.g. a network drop mid-RPC) would otherwise
    // reject unhandled and leave the spinner stuck on a real payment — catch it,
    // but re-throw NEXT_REDIRECT/NEXT_NOT_FOUND untouched so the happy path is
    // unaffected.
    try {
      const res = await placeOrder()
      if (res?.error) {
        setErrorMessage(res.error)
        setSubmitting(false)
        return
      }
      // Success: placeOrder() already redirected. Nothing else to do.
    } catch (err) {
      unstable_rethrow(err)
      setErrorMessage("Something went wrong reaching our server. Please try again.")
      setSubmitting(false)
    }
  }

  const handlePayment = () => {
    setSubmitting(true)

    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton
