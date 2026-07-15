"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import { Button } from "@/components/ui/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * WB-082: route error boundary for everything inside `(main)` (renders within
 * the layout, so `.frame` tokens apply). Without this, any uncaught server
 * error showed Next's unstyled default in production.
 *
 * WB-092 C8: `/order/confirmed/[id]` rethrows through here on a transport/5xx
 * failure (a genuine 404 now returns null and 404s honestly instead -- see
 * `lib/data/orders.ts`'s `retrieveOrder`). A customer landing here mid-order
 * just had their card charged; the generic copy alone reads as "your order
 * failed," which isn't something we know. Add a reassuring, non-fabricated
 * note for that path only.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const isOrderConfirmation = pathname?.includes("/order/confirmed/") ?? false

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
        {isOrderConfirmation && (
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              color: "var(--ink)",
              margin: "-10px 0 26px",
              padding: "14px 16px",
              background: "var(--soft)",
              borderRadius: "var(--radius)",
            }}
          >
            If you just placed an order, your order may still have gone
            through even though this page didn&apos;t load — check your email
            for a confirmation before trying again.
          </p>
        )}
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
