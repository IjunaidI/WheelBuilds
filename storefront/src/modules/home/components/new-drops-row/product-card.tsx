import Icon from "@modules/common/components/icon"
import Wheel, { Finish } from "@modules/common/components/wheel"

export type ProductCardProps = {
  name: string
  brand: string
  price: string
  isNew?: boolean
  finish?: Finish
  swatches?: string[]
  fits?: boolean
  compact?: boolean
}

const DEFAULT_SWATCHES = ["#0F0F10", "#8a5a30", "#c8c8cc", "#3A3A3D"]

const ProductCard = ({
  name,
  brand,
  price,
  isNew,
  finish = "black",
  swatches = DEFAULT_SWATCHES,
  fits,
  compact,
}: ProductCardProps) => (
  <div className="product-card" style={{ padding: compact ? 16 : 20 }}>
    {isNew && (
      <span
        className="tag-new"
        style={{ position: "absolute", top: 16, left: 16, zIndex: 2 }}
      >
        NEW
      </span>
    )}
    <button
      type="button"
      aria-label="Save to wishlist"
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        zIndex: 2,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--ink)",
        padding: 0,
      }}
    >
      <Icon name="heart" size={18} />
    </button>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: compact ? 180 : 220,
        padding: "12px 0",
        position: "relative",
      }}
    >
      <Wheel size={compact ? 160 : 200} finish={finish} />
    </div>
    <div className="label-muted" style={{ marginBottom: 6, fontSize: 10 }}>
      {brand}
    </div>
    <div
      style={{
        fontFamily: "var(--display)",
        fontWeight: 900,
        fontSize: compact ? 17 : 19,
        lineHeight: 1.1,
        color: "var(--ink)",
        letterSpacing: "0.01em",
        textTransform: "uppercase",
      }}
    >
      {name}
    </div>
    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
      {swatches.map((s, i) => (
        <span key={i} className="swatch-dot" style={{ background: s }} />
      ))}
      <span
        style={{
          fontSize: 10,
          color: "var(--ink-soft)",
          marginLeft: 4,
          alignSelf: "center",
          fontFamily: "var(--mono)",
        }}
      >
        +2
      </span>
    </div>
    <div
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid var(--hairline)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span className="label-muted" style={{ fontSize: 10 }}>
        FROM
      </span>
      <span
        style={{
          fontFamily: "var(--display)",
          fontWeight: 900,
          fontSize: 18,
        }}
      >
        <span style={{ color: "var(--orange)" }}>$</span>
        {price}
      </span>
    </div>
    {fits && (
      <div style={{ marginTop: 10 }}>
        <span className="fits-chip">
          <Icon name="check" size={11} color="white" strokeWidth={2.5} />
          FITS YOUR F-150
        </span>
      </div>
    )}
  </div>
)

export default ProductCard
