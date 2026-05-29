import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import ExpressPay from "@modules/checkout/components/express-pay"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import SectionShell from "@modules/checkout/components/section-shell"
import Shipping from "@modules/checkout/components/shipping"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <ExpressPay />
      <div className="w-full flex flex-col gap-4">
        <SectionShell num={1} title="Shipping address">
          <Addresses cart={cart} customer={customer} />
        </SectionShell>
        <SectionShell num={2} title="Shipping method">
          <Shipping cart={cart} availableShippingMethods={shippingMethods} />
        </SectionShell>
        <SectionShell num={3} title="Payment">
          <Payment cart={cart} availablePaymentMethods={paymentMethods} />
        </SectionShell>
        <SectionShell num={4} title="Review & place order">
          <Review cart={cart} />
        </SectionShell>
      </div>
    </div>
  )
}
