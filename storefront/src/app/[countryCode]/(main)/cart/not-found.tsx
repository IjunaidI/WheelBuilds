import { Metadata } from "next"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "404",
  description: "This cart doesn't exist",
}

/**
 * WB-085: nested under `(main)/cart/`, so this renders inside
 * `(main)/layout.tsx` (Nav/Footer + `.frame`) same as the group's generic
 * not-found. Keeps cart-specific copy — a missing cart is a different event
 * (expired/cleared cookie) than a plain dead link.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-5 py-24 small:py-32 min-h-[60vh]">
      <Label bar style={{ marginBottom: 14 }}>
        404
      </Label>
      <Display as="h1" size={44}>
        This cart doesn&apos;t exist
      </Display>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.75,
          color: "var(--graphite)",
          margin: "18px 0 30px",
          maxWidth: 440,
        }}
      >
        It may have expired, or its cookie got cleared. Head back to the
        catalog to start a new build.
      </p>
      <LocalizedClientLink href="/store" className="btn btn-primary">
        Browse the catalog
      </LocalizedClientLink>
    </div>
  )
}
