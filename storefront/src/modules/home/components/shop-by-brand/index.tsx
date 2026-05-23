import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"

const BRANDS = [
  "BLACKLINE", "VANGUARD", "MERIDIAN", "RONIN",
  "ATLAS", "STRIKER", "AVANT", "FORGEHAUS",
  "KAIDO", "AEGIS", "MONARCH", "TYPHOON",
]

const ShopByBrand = () => (
  <section
    style={{
      padding: "120px 80px",
      background: "white",
      borderTop: "1px solid var(--hairline)",
    }}
  >
    <SectionHeader
      eyebrow="42 BRANDS · ALL AUTHORIZED"
      title="Trusted Brands"
      action={<MicroLink href="/collections">View all brands</MicroLink>}
    />
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
      }}
    >
      {BRANDS.map((b) => (
        <LocalizedClientLink
          key={b}
          href="/collections"
          className="brand-chip"
          style={{ textDecoration: "none" }}
        >
          <span
            style={{
              fontFamily: "var(--display)",
              fontWeight: 900,
              fontSize: 22,
              color: "var(--ink)",
              letterSpacing: "0.04em",
            }}
          >
            {b}
          </span>
        </LocalizedClientLink>
      ))}
    </div>
  </section>
)

export default ShopByBrand
