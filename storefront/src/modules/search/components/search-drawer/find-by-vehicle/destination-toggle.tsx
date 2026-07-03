"use client"

import { FitmentTarget } from "./destination-url"

type DestinationToggleProps = {
  value: FitmentTarget
  onChange: (t: FitmentTarget) => void
}

const OPTIONS: { key: FitmentTarget; label: string }[] = [
  { key: "wheels", label: "Wheels" },
  { key: "tires", label: "Tires" },
]

/** "Shop for: Wheels | Tires" segmented control for the find-by-vehicle drawer. */
const DestinationToggle = ({ value, onChange }: DestinationToggleProps) => (
  <div className="flex items-center gap-3">
    <span className="text-[11px] uppercase tracking-wide text-[var(--ink-soft)] font-[var(--mono)]">
      Shop for
    </span>
    <div
      className="inline-flex rounded-[var(--radius)] border p-0.5"
      style={{ borderColor: "var(--hairline)", background: "var(--soft)" }}
      role="group"
      aria-label="Shop for wheels or tires"
    >
      {OPTIONS.map((o) => {
        const selected = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={selected}
            className="px-3 py-1 text-[12px] font-semibold rounded-[calc(var(--radius)-2px)] transition-colors"
            style={{
              background: selected ? "var(--orange)" : "transparent",
              color: selected ? "white" : "var(--ink)",
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  </div>
)

export default DestinationToggle
