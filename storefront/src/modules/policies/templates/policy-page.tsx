import type { CSSProperties } from "react"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"

export type PolicySection = {
  /** Optional anchor id (e.g. "fitment") so other pages can deep-link to this
   * section — see PurchasePanel's "Fitment guarantee" trust-strip cell
   * (WB-091 P6), which links to `/returns#fitment`. */
  id?: string
  heading?: string
  paragraphs?: string[]
  bullets?: string[]
}

export type PolicyContent = {
  eyebrow: string
  title: string
  /** Human-readable "last updated" date, e.g. "July 2026". */
  updated: string
  intro?: string
  sections: PolicySection[]
}

const body: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.75,
  color: "var(--graphite)",
  margin: "0 0 14px",
}

/**
 * Shared renderer for the static policy/support pages (/returns, /shipping,
 * /privacy, /terms — WB-081). One centered prose column inside `.frame`; the
 * copy lives in ../content.ts.
 */
const PolicyPage = ({ content }: { content: PolicyContent }) => {
  return (
    <div className="px-5 xsmall:px-8 small:px-20 py-14 small:py-20">
      <div style={{ maxWidth: 760 }}>
        <Label bar style={{ marginBottom: 14, display: "block" }}>
          {content.eyebrow}
        </Label>
        <Display as="h1" size={44}>
          {content.title}
        </Display>
        <div style={{ marginTop: 10, marginBottom: 34 }}>
          <Label tone="muted">LAST UPDATED · {content.updated}</Label>
        </div>

        {content.intro && <p style={body}>{content.intro}</p>}

        {content.sections.map((s, i) => (
          <section
            key={i}
            id={s.id}
            style={{ marginTop: s.heading ? 30 : 0, scrollMarginTop: 24 }}
          >
            {s.heading && (
              <div style={{ marginBottom: 10 }}>
                <Display as="h2" size={20}>
                  {s.heading}
                </Display>
              </div>
            )}
            {(s.paragraphs ?? []).map((p, n) => (
              <p key={n} style={body}>
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul style={{ paddingLeft: 18, margin: "0 0 14px" }}>
                {s.bullets.map((b, n) => (
                  <li key={n} style={{ ...body, margin: "0 0 8px" }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

export default PolicyPage
