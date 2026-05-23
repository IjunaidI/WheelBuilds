import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Wheel, { Finish } from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Icon from "@modules/common/components/icon"

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
    <Display size={40} style={{ marginBottom: 32 }}>
      Shop by Style
    </Display>
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
            <Display size={28}>{t.label}</Display>
            <Label tone="muted" style={{ marginTop: 8, display: "block" }}>
              {t.count}
            </Label>
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em]"
              style={{ marginTop: 32, display: "inline-flex", color: "var(--orange)" }}
            >
              Explore
              <Icon name="arrow-right" size={14} color="#FF6A00" strokeWidth={2} />
            </span>
          </div>
          <Wheel size={140} finish={t.finish} />
        </LocalizedClientLink>
      ))}
    </div>
  </section>
)

export default ShopByStyle
