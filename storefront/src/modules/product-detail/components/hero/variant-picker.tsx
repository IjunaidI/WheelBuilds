"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SizeOption } from "../../data/types"

type VariantPickerProps = {
  sizes: SizeOption[]
  selectedSize: SizeOption
  onSizeChange: (s: SizeOption) => void

  boltPatterns: string[]
  selectedBoltPattern: string
  onBoltPatternChange: (b: string) => void
}

const AVAILABILITY_LABEL: Record<SizeOption["availability"], string> = {
  in_stock: "In stock — ships 2–3 days",
  low_stock: "Low stock — last few sets",
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
}: VariantPickerProps) => {
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
        <div className="grid grid-cols-4 gap-1.5">
          {sizes.map((s) => {
            const active =
              sizeKey(s) === sizeKey(selectedSize) &&
              s.availability !== "out_of_stock"
            const disabled = s.availability === "out_of_stock"
            return (
              <Tooltip key={sizeKey(s)}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSizeChange(s)}
                    className={cn(
                      "relative h-14 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
                      active &&
                        "border-[var(--orange)] bg-[var(--orange)] text-white",
                      !active &&
                        !disabled &&
                        "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]",
                      disabled &&
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
                    {s.weightLb} lb · {AVAILABILITY_LABEL[s.availability]}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Bolt pattern row */}
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

      {/* Weight + stock readout. Offset moved to the AutoFitmentCard below. */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--hairline)]">
        <Stat label="Weight" value={`${selectedSize.weightLb} lb`} />
        <Stat
          label="Status"
          value={
            selectedSize.availability === "in_stock"
              ? "In stock"
              : selectedSize.availability === "low_stock"
                ? "Low stock"
                : "Out of stock"
          }
          accent={selectedSize.availability !== "out_of_stock"}
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
