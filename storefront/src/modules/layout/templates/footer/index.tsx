import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Logo from "@modules/common/components/logo"

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
  {
    h: "Help",
    items: [
      { label: "Fitment Guide", href: "#" },
      { label: "Bolt Pattern", href: "#" },
      { label: "Returns", href: "#" },
      { label: "Shipping", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    h: "Company",
    items: [
      { label: "About", href: "#" },
      { label: "Build Gallery", href: "#" },
      { label: "Press", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Dealers", href: "#" },
    ],
  },
]

export default async function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--hairline)",
        padding: "64px 80px 32px",
        background: "white",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr",
          gap: 40,
          marginBottom: 56,
        }}
      >
        <div>
          <LocalizedClientLink
            href="/"
            style={{ textDecoration: "none", display: "inline-flex" }}
          >
            <Logo size={20} />
          </LocalizedClientLink>
          <div
            style={{
              fontSize: 13,
              color: "var(--graphite)",
              marginTop: 16,
              maxWidth: 260,
              lineHeight: 1.6,
            }}
          >
            Authorized dealer for 40+ premium aftermarket wheel brands. Built
            in Long Beach.
          </div>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.h}>
            <div className="label-muted" style={{ marginBottom: 14 }}>
              {col.h}
            </div>
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
        style={{
          borderTop: "1px solid var(--hairline)",
          paddingTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            letterSpacing: "0.04em",
            fontFamily: "var(--mono)",
          }}
        >
          © {new Date().getFullYear()} WHEEL/BUILDS, INC. · ALL RIGHTS
          RESERVED · TERMS · PRIVACY
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            color: "var(--ink)",
            alignItems: "center",
          }}
        >
          <a
            href="#"
            aria-label="Instagram"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <Icon name="instagram" size={16} />
          </a>
          <a
            href="#"
            aria-label="YouTube"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <Icon name="youtube" size={16} />
          </a>
          <a
            href="#"
            aria-label="TikTok"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <Icon name="tiktok" size={16} />
          </a>
          <a
            href="#"
            aria-label="Facebook"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <Icon name="facebook" size={16} />
          </a>
        </div>
      </div>
    </footer>
  )
}
