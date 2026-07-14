import { Metadata } from "next"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SearchCta from "@modules/search/components/search-cta"

export const metadata: Metadata = {
  title: "404",
  description: "This page doesn't exist",
}

/**
 * WB-085: renders inside `(main)/layout.tsx`, so it already gets Nav/Footer
 * chrome + `.frame` tokens — no wrapper needed here. Offers both a direct
 * catalog link and the search drawer (via `SearchCta`), since a dead link can
 * land a visitor who was looking for something specific.
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
        <LocalizedClientLink href="/store" className="btn btn-primary">
          Browse the catalog
        </LocalizedClientLink>
        <SearchCta />
      </div>
    </div>
  )
}
