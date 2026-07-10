import { Metadata } from "next"
import PolicyPage from "@modules/policies/templates/policy-page"
import { SHIPPING_POLICY } from "@modules/policies/content"

export const metadata: Metadata = {
  title: "Shipping",
  description:
    "Shipping rates, processing times, and transit-damage help for Wheel Builds orders.",
}

export default function ShippingPage() {
  return <PolicyPage content={SHIPPING_POLICY} />
}
