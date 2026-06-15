import Icon, { IconName } from "@modules/common/components/icon"

const TrustStrip = ({ brandCount }: { brandCount?: number }) => {
  const ITEMS: { icon: IconName; h: string; s: string }[] = [
    { icon: "shipping", h: "Free shipping $199+", s: "Lower 48, ground" },
    { icon: "shield", h: "Fitment guarantee", s: "Or your money back" },
    {
      icon: "badge",
      h: "Authorized dealer",
      s: brandCount ? `${brandCount} premium brands` : "Premium brands",
    },
    { icon: "return", h: "30-day returns", s: "Unmounted wheels" },
  ]

  return (
    <div
      className="grid grid-cols-2 small:grid-cols-4 bg-white"
      style={{
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      {ITEMS.map((it, i) => {
        // On small+, separators only between items.
        // On mobile (2-col), separator right of odd-indexed items and below
        // the first row.
        const isLastInRow = (i + 1) % 2 === 0
        const isLastRow = i >= ITEMS.length - 2
        return (
          <div
            key={it.h}
            className="flex items-center gap-3.5 p-5 small:px-8 small:py-7"
            style={{
              borderRight:
                i < ITEMS.length - 1 && !isLastInRow
                  ? "1px solid var(--hairline)"
                  : undefined,
              borderBottom:
                !isLastRow ? "1px solid var(--hairline)" : undefined,
            }}
          >
            <Icon name={it.icon} size={22} strokeWidth={1.4} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--ink)] truncate">
                {it.h}
              </div>
              <div className="text-[12px] text-[var(--ink-soft)] mt-0.5 truncate">
                {it.s}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default TrustStrip
