"use client"

type TabProps = {
  id: string
  active: boolean
  label: string
  sub: string
  onClick: () => void
}

const Tab = ({ active, label, sub, onClick }: TabProps) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      flex: 1,
      background: active ? "white" : "transparent",
      border: "1px solid",
      borderColor: active ? "var(--ink)" : "var(--hairline)",
      borderRadius: 4,
      padding: "12px 14px",
      textAlign: "left",
      cursor: "pointer",
      position: "relative",
      outline: "none",
      fontFamily: "inherit",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          border: "1px solid",
          borderColor: active ? "var(--orange)" : "var(--hairline)",
          background: "white",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {active && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              background: "var(--orange)",
            }}
          />
        )}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
        {label}
      </span>
    </div>
    <div
      style={{
        fontSize: 11,
        color: "var(--ink-soft)",
        marginTop: 4,
        paddingLeft: 22,
        fontFamily: "var(--mono)",
      }}
    >
      {sub}
    </div>
  </button>
)

export default Tab
