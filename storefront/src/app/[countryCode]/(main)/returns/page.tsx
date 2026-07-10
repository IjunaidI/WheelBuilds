import { Metadata } from "next"
import PolicyPage from "@modules/policies/templates/policy-page"
import { RETURNS_POLICY } from "@modules/policies/content"

export const metadata: Metadata = {
  title: "Returns & Exchanges",
  description:
    "How returns, refunds, and exchanges work for wheels and tires at Wheel Builds.",
}

export default function ReturnsPage() {
  return <PolicyPage content={RETURNS_POLICY} />
}
