"use client"

import { useEffect } from "react"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import { Button } from "@/components/ui/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * WB-082: route error boundary for everything inside `(main)` (renders within
 * the layout, so `.frame` tokens apply). Without this, any uncaught server
 * error showed Next's unstyled default in production.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[error-boundary:(main)]", error)
  }, [error])

  return (
    <div className="px-5 xsmall:px-8 small:px-20 py-24 small:py-32">
      <div style={{ maxWidth: 640 }}>
        <Label bar style={{ marginBottom: 14, display: "block" }}>
          ERROR
        </Label>
        <Display as="h1" size={44}>
          Something broke on our end
        </Display>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.75,
            color: "var(--graphite)",
            margin: "18px 0 26px",
          }}
        >
          The page hit an unexpected error. It's been logged — try again, or
          head back to the catalog.
          {error.digest ? ` (Ref: ${error.digest})` : ""}
        </p>
        <div className="flex gap-3 items-center">
          <Button onClick={() => reset()}>Try again</Button>
          <LocalizedClientLink
            href="/store"
            style={{
              fontSize: 13,
              color: "var(--ink)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            Back to catalog
          </LocalizedClientLink>
        </div>
      </div>
    </div>
  )
}
