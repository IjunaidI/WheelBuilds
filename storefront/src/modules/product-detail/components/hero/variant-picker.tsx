"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { OffsetVariant, SizeOption } from "../../data/types"
import { SHIP_LEAD_TIME } from "../../data/pdp-config"

type VariantPickerProps = {
  sizes: SizeOption[]
  selectedSize: SizeOption
  onSizeChange: (s: SizeOption) => void

  boltPatterns: string[]
  selectedBoltPattern: string
  onBoltPatternChange: (b: string) => void

  /**
   * The actually-selected leaf variant (size × offset × bore × load). The
   * Status stat reads ITS availability, not the size-level rollup
   * (`selectedSize.availability`), so it can never disagree with the buy
   * button on the same screen (WB-090 P1). Falls back to the size rollup
   * when absent (e.g. a variant-less size).
   */
  selectedVariant?: OffsetVariant | null
}

// "last few sets" was wrong — a size at/under the low-stock threshold (default
// 4 units) is at most 1 set, not several (WB-090 P2/P18).
const AVAILABILITY_LABEL: Record<SizeOption["availability"], string> = {
  in_stock: `In stock — ${SHIP_LEAD_TIME}`,
  low_stock: "Low stock — only a few left",
  out_of_stock: "Out of stock",
}

const sizeKey = (s: SizeOption) => `${s.diameter}x${s.width}+${s.offsetMm}`

/**
 * Three stacked picker rows: size matrix (Diameter × Width), bolt pattern row,
 * and offset row (a derived facet of the selected size). Each pick has a
 * Tooltip showing availability + weight + offset.
 */
const VariantPicker = ({
  sizes,
  selectedSize,
  onSizeChange,
  boltPatterns,
  selectedBoltPattern,
  onBoltPatternChange,
  selectedVariant,
}: VariantPickerProps) => {
  const statusAvailability = selectedVariant?.availability ?? selectedSize.availability
  // WB-090 P16: when EVERY size in the grid is sold out, `active` (below)
  // would otherwise never highlight any cell — the shopper's actual selection
  // becomes visually invisible even though `selectedSize` still holds a real
  // value. Surface it honestly with an explicit banner instead.
  const allOutOfStock = sizes.length > 0 && sizes.every((s) => s.availability === "out_of_stock")
  return (
    <div className="flex flex-col gap-5">
      {/* Size matrix */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <Label tone="muted">Size · Diameter × Width</Label>
          <span className="text-[11px] font-[var(--mono)] text-[var(--ink-soft)]">
            {sizes.length} configs
          </span>
        </div>
        {allOutOfStock && (
          <div
            role="status"
            className="mb-2 rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--soft)] px-3 py-2 text-[12px] font-semibold text-[var(--ink-soft)]"
          >
            Currently out of stock — every size shown is sold out.
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5">
          {sizes.map((s) => {
            const disabled = s.availability === "out_of_stock"
            // Same match as before (`!disabled`) unless every size is OOS, in
            // which case the selected cell is still highlighted so the grid
            // never shows "no selection" (WB-090 P16).
            const active =
              sizeKey(s) === sizeKey(selectedSize) && (!disabled || allOutOfStock)
            return (
              <Tooltip key={sizeKey(s)}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-disabled={disabled}
                    onClick={() => {
                      // Native `disabled` was removed so the button stays
                      // focusable/tabbable and its Tooltip is keyboard- and
                      // screen-reader-reachable (WB-090 P16); selection is
                      // instead blocked here.
                      if (disabled) return
                      onSizeChange(s)
                    }}
                    className={cn(
                      "relative h-14 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
                      active &&
                        "border-[var(--orange)] bg-[var(--orange)] text-white",
                      !active &&
                        !disabled &&
                        "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]",
                      disabled &&
                        !active &&
                        "border-[var(--hairline)] bg-[var(--soft)] text-[var(--ink-soft)] opacity-60 cursor-not-allowed line-through"
                    )}
                  >
                    {s.diameter}×{s.width}
                    {s.availability === "low_stock" && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 right-1.5 inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          background: active ? "white" : "var(--orange)",
                        }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-semibold">
                    {s.diameter}" × {s.width}" · {s.offsetMm >= 0 ? "+" : ""}
                    {s.offsetMm}mm
                  </div>
                  <div className="text-[10px] opacity-80">
                    {s.weightLb > 0 ? `${s.weightLb} lb · ` : ""}
                    {AVAILABILITY_LABEL[s.availability]}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Bolt pattern row — hidden when there's nothing meaningful to choose
          (≤1 real pattern). Placeholder patterns are already filtered upstream. */}
      {boltPatterns.length > 1 && (
        <div>
          <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
            Bolt pattern
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {boltPatterns.map((bp) => {
              const active = bp === selectedBoltPattern
              return (
                <button
                  key={bp}
                  type="button"
                  onClick={() => onBoltPatternChange(bp)}
                  className={cn(
                    "h-10 px-4 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
                    active
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                      : "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
                  )}
                >
                  {bp}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Weight + stock readout. Offset moved to the AutoFitmentCard below. */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--hairline)]">
        {selectedSize.weightLb > 0 && (
          <Stat label="Shipping weight" value={`${selectedSize.weightLb} lb`} />
        )}
        <Stat
          label="Status"
          value={
            statusAvailability === "in_stock"
              ? "In stock"
              : statusAvailability === "low_stock"
                ? "Low stock"
                : "Out of stock"
          }
          accent={statusAvailability !== "out_of_stock"}
        />
      </div>
    </div>
  )
}

const Stat = ({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) => (
  <div>
    <Label tone="muted" style={{ fontSize: 10, display: "block" }}>
      {label}
    </Label>
    <div
      className="font-[var(--display)] text-[18px] font-black"
      style={{ color: accent ? "var(--orange)" : "var(--ink)", marginTop: 4 }}
    >
      {value}
    </div>
  </div>
)

export default VariantPicker
