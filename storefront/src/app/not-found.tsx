import { Metadata } from "next"
import Link from "next/link"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"

export const metadata: Metadata = {
  title: "404",
  description: "This page doesn't exist",
}

/**
 * Root-level catch-all (WB-085). Reached only when even the `[countryCode]`
 * segment can't be resolved, so there's no localized-link context here —
 * plain `next/link`, not `LocalizedClientLink` (which needs `useParams()`).
 * The root layout doesn't apply `.frame` (only `(main)` and `(checkout)` do),
 * so this wraps its own content in one to pick up WB tokens/classes.
 * `/store` still resolves without a country prefix — middleware redirects it
 * to `/<countryCode>/store`.
 */
export default function NotFound() {
  return (
    <div className="frame" style={{ minHeight: "100vh" }}>
      <div
        className="flex flex-col items-center justify-center text-center px-5"
        style={{ minHeight: "100vh" }}
      >
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
        <Link href="/store" className="btn btn-primary">
          Browse the catalog
        </Link>
      </div>
    </div>
  )
}
