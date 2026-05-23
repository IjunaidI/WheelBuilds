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
    className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px] bg-white"
    style={{ borderTop: "1px solid var(--hairline)" }}
  >
    <SectionHeader
      eyebrow="42 BRANDS · ALL AUTHORIZED"
      title="Trusted Brands"
      action={<MicroLink href="/collections">View all brands</MicroLink>}
    />
    <div className="grid grid-cols-2 xsmall:grid-cols-3 small:grid-cols-4 gap-3 small:gap-4">
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
