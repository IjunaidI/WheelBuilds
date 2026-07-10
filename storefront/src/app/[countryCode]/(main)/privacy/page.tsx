import { Metadata } from "next"
import PolicyPage from "@modules/policies/templates/policy-page"
import { PRIVACY_POLICY } from "@modules/policies/content"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Wheel Builds collects, why, and who processes it.",
}

export default function PrivacyPage() {
  return <PolicyPage content={PRIVACY_POLICY} />
}
