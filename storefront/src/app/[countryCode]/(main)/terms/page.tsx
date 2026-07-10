import { Metadata } from "next"
import PolicyPage from "@modules/policies/templates/policy-page"
import { TERMS_OF_SERVICE } from "@modules/policies/content"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern orders and use of the Wheel Builds store.",
}

export default function TermsPage() {
  return <PolicyPage content={TERMS_OF_SERVICE} />
}
