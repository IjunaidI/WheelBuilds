import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Logo from "@modules/common/components/logo"
import Label from "@modules/common/components/label"

const FOOTER_COLUMNS: { h: string; items: { label: string; href: string }[] }[] = [
  {
    h: "Shop",
    items: [
      { label: "All Wheels", href: "/store" },
      { label: "New Drops", href: "/collections" },
      { label: "Off-Road", href: "/categories" },
      { label: "Luxury", href: "/categories" },
      { label: "Street", href: "/categories" },
      { label: "Truck & Dually", href: "/categories" },
    ],
  },
  {
    h: "Brands",
    items: [
      { label: "Forgiato Type", href: "/collections" },
      { label: "Vossen Type", href: "/collections" },
      { label: "Method Type", href: "/collections" },
      { label: "Fuel Type", href: "/collections" },
      { label: "All Brands", href: "/collections" },
    ],
  },
  // WB-081: every footer link now points at a real route — the Help/Company
  // columns were ten dead `#` anchors. Company links (About/Press/Careers…)
  // are gone until those pages exist; Legal carries the policy pages.
  {
    h: "Help",
    items: [
      { label: "Contact", href: "/contact" },
      { label: "Returns & Exchanges", href: "/returns" },
      { label: "Shipping", href: "/shipping" },
    ],
  },
  {
    h: "Legal",
    items: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
]

const SOCIALS: { name: "instagram" | "youtube" | "tiktok" | "facebook"; label: string }[] = [
  { name: "instagram", label: "Instagram" },
  { name: "youtube", label: "YouTube" },
  { name: "tiktok", label: "TikTok" },
  { name: "facebook", label: "Facebook" },
]

export default async function Footer() {
  return (
    <footer
      className="px-5 pt-12 pb-8 xsmall:px-8 small:px-20 small:pt-16 bg-white"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      {/*
        Mobile  : 1-col stack — brand block, then each link column full-width.
        xsmall+ : 2-col grid of link columns; brand block above spans both.
        small+  : 5-col original layout (1.6fr 1fr 1fr 1fr 1fr).
      */}
      <div className="grid grid-cols-1 xsmall:grid-cols-2 small:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-x-8 gap-y-10 mb-12 small:mb-14">
        <div className="xsmall:col-span-2 small:col-span-1">
          <LocalizedClientLink
            href="/"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            <Logo size={20} />
          </LocalizedClientLink>
          <div className="text-[13px] text-[var(--graphite)] mt-4 max-w-[260px] leading-[1.6]">
            Authorized dealer for 40+ premium aftermarket wheel brands. Built
            in Long Beach.
          </div>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.h}>
            <Label tone="muted" style={{ marginBottom: 14, display: "block" }}>
              {col.h}
            </Label>
            {col.items.map((it) => (
              <LocalizedClientLink
                key={it.label}
                href={it.href}
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "var(--graphite)",
                  marginBottom: 8,
                  textDecoration: "none",
                }}
              >
                {it.label}
              </LocalizedClientLink>
            ))}
          </div>
        ))}
      </div>
      <div
        className="pt-5 flex flex-col xsmall:flex-row gap-4 xsmall:gap-0 xsmall:justify-between xsmall:items-center"
        style={{ borderTop: "1px solid var(--hairline)" }}
      >
        <Label
          tone="muted"
          style={{ letterSpacing: "0.04em" }}
          className="leading-relaxed"
        >
          © {new Date().getFullYear()} WHEEL/BUILDS, INC. · ALL RIGHTS
          RESERVED ·{" "}
          <LocalizedClientLink
            href="/terms"
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            TERMS
          </LocalizedClientLink>{" "}
          ·{" "}
          <LocalizedClientLink
            href="/privacy"
            style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            PRIVACY
          </LocalizedClientLink>
        </Label>
        <div className="flex gap-3.5 items-center text-[var(--ink)]">
          {/* WB-081: decorative until real profile URLs exist — a dead `#`
              anchor scrolled to top and read as broken. Give SOCIALS an
              `href` field and restore <a> when the accounts are live. */}
          {SOCIALS.map((s) => (
            <span
              key={s.name}
              aria-hidden="true"
              style={{ color: "inherit", display: "inline-flex" }}
            >
              <Icon name={s.name} size={16} />
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}
