import Script from "next/script"

/**
 * WB-082: env-gated, zero-dependency analytics. Renders the Plausible snippet
 * only when NEXT_PUBLIC_ANALYTICS_DOMAIN is set (the site's domain as
 * registered in Plausible) — the storefront ships with analytics fully OFF.
 * Swapping vendors means swapping this one component.
 */
const ANALYTICS_DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN

export default function Analytics() {
  if (!ANALYTICS_DOMAIN) return null
  return (
    <Script
      defer
      data-domain={ANALYTICS_DOMAIN}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  )
}
