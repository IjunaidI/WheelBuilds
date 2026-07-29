import { Metadata } from "next"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ContactForm from "@modules/support/components/contact-form"
import { supportChannels } from "@modules/support/support-config"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get help with an order, fitment, returns, or anything else.",
}

type ContactPageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{
    subject?: string
    vehicle?: string
    product?: string
    source?: string
  }>
}

/**
 * WB-119 Q-04.
 *
 * Before this, the rendered page had no form, no email and no phone — three
 * FAQ links and nothing else — while SIX surfaces sent customers here,
 * including the returns policy ("contact us BEFORE ordering") and the
 * out-of-stock CTA ("special order — contact us to order"). Every
 * special-order enquiry had no way to arrive.
 *
 * The `mailto:` half already existed (WB-081) but renders only when
 * `NEXT_PUBLIC_SUPPORT_EMAIL` is set, which it is not in production — so the
 * page fell through to its prose fallback and read as empty. Both channels
 * stay env-gated (a fabricated address is worse than none), but the FORM now
 * works regardless, because submissions are stored server-side before any
 * notification is attempted.
 */
export default async function ContactPage({
  params,
  searchParams,
}: ContactPageProps) {
  const { countryCode } = await params
  const { subject, vehicle, product, source } = await searchParams
  const channels = supportChannels()

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
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              color: "var(--graphite)",
              margin: "0 0 10px",
            }}
          >
            Questions about an order, fitment for your vehicle, or a return?
            Send us a message below — a real person answers.
          </p>

          {channels.hasAny && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {channels.email && (
                <a
                  href={`mailto:${channels.email}`}
                  style={{
                    fontSize: 18,
                    color: "var(--orange-deep)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  {channels.email}
                </a>
              )}
              {channels.phone && (
                <a
                  href={`tel:${channels.phone.replace(/[^\d+]/g, "")}`}
                  style={{
                    fontSize: 18,
                    color: "var(--orange-deep)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  {channels.phone}
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 30 }}>
          <ContactForm
            defaultSubject={subject}
            vehicle={vehicle}
            productHandle={product}
            source={source ?? "contact"}
            countryCode={countryCode}
          />
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
