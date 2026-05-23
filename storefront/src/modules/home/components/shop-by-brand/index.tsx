import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"

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
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 48,
      }}
    >
      <div>
        <div className="label" style={{ marginBottom: 12 }}>
          42 BRANDS · ALL AUTHORIZED
        </div>
        <div className="display" style={{ fontSize: 40, color: "var(--ink)" }}>
          Trusted Brands
        </div>
      </div>
      <LocalizedClientLink
        href="/collections"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--orange)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textDecoration: "none",
          display: "inline-flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        View all brands <Icon name="arrow-right" size={14} color="#FF6A00" />
      </LocalizedClientLink>
    </div>
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
