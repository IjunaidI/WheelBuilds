import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel, { Finish } from "@modules/common/components/wheel"

const STYLE_TILES: { label: string; count: string; finish: Finish }[] = [
  { label: "OFF-ROAD", count: "12 wheels", finish: "black" },
  { label: "LUXURY", count: "84 wheels", finish: "silver" },
  { label: "STREET", count: "127 wheels", finish: "bronze" },
  { label: "TRUCK & DUALLY", count: "61 wheels", finish: "black" },
  { label: "DRAG", count: "23 wheels", finish: "silver" },
  { label: "UTV", count: "38 wheels", finish: "bronze" },
]

const ShopByStyle = () => (
  <section style={{ padding: "0 80px 120px" }}>
    <div
      className="display"
      style={{ fontSize: 40, color: "var(--ink)", marginBottom: 32 }}
    >
      Shop by Style
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 16,
      }}
    >
      {STYLE_TILES.map((t) => (
        <LocalizedClientLink
          key={t.label}
          href="/categories"
          className="style-tile"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div>
            <div
              className="display"
              style={{ fontSize: 28, color: "var(--ink)" }}
            >
              {t.label}
            </div>
            <div className="label-muted" style={{ marginTop: 8 }}>
              {t.count}
            </div>
            <div
              style={{
                marginTop: 32,
                color: "var(--orange)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Explore <Icon name="arrow-right" size={14} color="#FF6A00" strokeWidth={2} />
            </div>
          </div>
          <Wheel size={140} finish={t.finish} />
        </LocalizedClientLink>
      ))}
    </div>
  </section>
)

export default ShopByStyle
