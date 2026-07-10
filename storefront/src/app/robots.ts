import { MetadataRoute } from "next"
import { getBaseURL } from "@lib/util/env"

/**
 * WB-082: crawler policy. Transactional/private surfaces are excluded; the
 * catalog (home, /store, /tires, PDPs, policy pages) is crawlable and
 * enumerated by /sitemap.xml.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getBaseURL().replace(/\/$/, "")
  return {
    rules: [
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
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
