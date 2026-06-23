"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"

type SpecSelectorProps = {
  label: string
  values: number[]
  selected: number | null
  onSelect: (v: number) => void
  /** Suffix shown on each chip, e.g. "mm" or "lb". */
  unit?: string
}

/**
 * A single labelled row of numeric option chips. Used for the PDP's
 * progressive-disclosure Center Bore / Load Rating selectors — rendered by the
 * hero only when a (size, offset) genuinely branches on that axis (WB-051).
 */
const SpecSelector = ({ label, values, selected, onSelect, unit }: SpecSelectorProps) => (
  <div>
    <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
      {label}
    </Label>
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => {
        const active = v === selected
        return (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={cn(
              "h-10 px-4 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
              active
                ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                : "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
            )}
          >
            {v}
            {unit ? unit : ""}
          </button>
        )
      })}
    </div>
  </div>
)

export default SpecSelector
