import Icon, { IconName } from "@modules/common/components/icon"

const ITEMS: { icon: IconName; h: string; s: string }[] = [
  { icon: "shipping", h: "Free shipping $199+", s: "Lower 48, ground" },
  { icon: "shield", h: "Fitment guarantee", s: "Or your money back" },
  { icon: "badge", h: "Authorized dealer", s: "40+ premium brands" },
  { icon: "return", h: "30-day returns", s: "Unmounted wheels" },
]

const TrustStrip = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      borderTop: "1px solid var(--hairline)",
      borderBottom: "1px solid var(--hairline)",
      background: "white",
    }}
  >
    {ITEMS.map((it, i) => (
      <div
        key={it.h}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "28px 32px",
          borderRight:
            i < ITEMS.length - 1 ? "1px solid var(--hairline)" : "none",
        }}
      >
        <Icon name={it.icon} size={22} strokeWidth={1.4} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {it.h}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
            {it.s}
          </div>
        </div>
      </div>
    ))}
  </div>
)

export default TrustStrip
