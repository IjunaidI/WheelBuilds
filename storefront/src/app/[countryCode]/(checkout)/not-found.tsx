import { Metadata } from "next"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "404",
  description: "This page doesn't exist",
}

/**
 * WB-085: renders inside `(checkout)/layout.tsx`, which already applies
 * `.frame` (WB-082 brought checkout into the design chrome) — no wrapper
 * needed here. Primary CTA goes back to the cart (the natural recovery step
 * mid-checkout); secondary link offers the full catalog.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-5 py-24 small:py-32 min-h-[60vh]">
      <Label bar style={{ marginBottom: 14 }}>
        404
      </Label>
      <Display as="h1" size={44}>
        This page doesn&apos;t exist
      </Display>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.75,
          color: "var(--graphite)",
          margin: "18px 0 30px",
          maxWidth: 420,
        }}
      >
        Let&apos;s get you back to the build.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <LocalizedClientLink href="/cart" className="btn btn-primary">
          Back to cart
        </LocalizedClientLink>
        <LocalizedClientLink
          href="/store"
          style={{
            fontSize: 13,
            color: "var(--ink)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Browse the catalog
        </LocalizedClientLink>
      </div>
    </div>
  )
}
