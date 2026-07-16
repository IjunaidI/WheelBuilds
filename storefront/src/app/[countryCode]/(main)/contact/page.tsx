import { Metadata } from "next"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get help with an order, fitment, returns, or anything else.",
}

// Client-visible support inbox. Optional — when unset we point at the
// order-email reply path instead of fabricating an address (WB-081).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL

export default function ContactPage() {
  return (
    <div className="px-5 xsmall:px-8 small:px-20 py-14 small:py-20">
      <div style={{ maxWidth: 760 }}>
        <Label bar style={{ marginBottom: 14, display: "block" }}>
          SUPPORT
        </Label>
        <Display as="h1" size={44}>
          Contact
        </Display>

        <div style={{ marginTop: 26 }}>
          {SUPPORT_EMAIL ? (
            <>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.75,
                  color: "var(--graphite)",
                  margin: "0 0 10px",
                }}
              >
                Questions about an order, fitment for your vehicle, or a return?
                Email us — a real person answers.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{
                  fontSize: 18,
                  color: "var(--orange-deep)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {SUPPORT_EMAIL}
              </a>
            </>
          ) : (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.75,
                color: "var(--graphite)",
                margin: 0,
              }}
            >
              Questions about an order, fitment for your vehicle, or a return?
              Reply to any order or account email from us and it lands in our
              support inbox — a real person answers.
            </p>
          )}
        </div>

        <div style={{ marginTop: 34 }}>
          <Label tone="muted" style={{ marginBottom: 12, display: "block" }}>
            COMMON QUESTIONS
          </Label>
          <ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
            {[
              { label: "Returns & Exchanges", href: "/returns" },
              { label: "Shipping rates & tracking", href: "/shipping" },
              { label: "Browse the catalog", href: "/store" },
            ].map((l) => (
              <li key={l.href} style={{ marginBottom: 8 }}>
                <LocalizedClientLink
                  href={l.href}
                  style={{
                    fontSize: 14,
                    color: "var(--ink)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  {l.label}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
