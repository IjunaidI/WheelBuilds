import { MetadataRoute } from "next"
import { getBaseURL, isFallbackBaseUrl } from "@lib/util/env"

/**
 * WB-082: crawler policy. Transactional/private surfaces are excluded; the
 * catalog (home, /store, /tires, PDPs, policy pages) is crawlable and
 * enumerated by /sitemap.xml.
 */
export default function robots(): MetadataRoute.Robots {
  const rawBase = getBaseURL()
  const base = rawBase.replace(/\/$/, "")
  const rules: MetadataRoute.Robots["rules"] = [
    {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/*/account",
        "/*/cart",
        "/*/checkout",
        "/*/order",
        "/*/forgot-password",
        "/*/reset-password",
      ],
    },
  ]

  // WB-095 X3: check-env-variables.js now requires NEXT_PUBLIC_BASE_URL, so
  // this branch should be unreachable from a real build -- belt-and-braces
  // second layer for any path that calls robots() directly without going
  // through next.config.js's gate. Unlike sitemap.ts (which has no host to
  // build a URL from other than the fallback), the sitemap: directive here
  // can simply be omitted rather than pointing crawlers at a loopback URL.
  if (isFallbackBaseUrl(rawBase)) {
    console.error(
      "[robots] NEXT_PUBLIC_BASE_URL is unset (falling back to https://localhost:8000) — omitting the sitemap directive. Set NEXT_PUBLIC_BASE_URL to fix."
    )
    return { rules }
  }

  return {
    rules,
    sitemap: `${base}/sitemap.xml`,
  }
}
