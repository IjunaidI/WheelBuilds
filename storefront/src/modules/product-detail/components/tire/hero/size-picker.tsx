"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TireSizeOption } from "../../../data/types"
import { SHIP_LEAD_TIME } from "../../../data/pdp-config"

type TireSizePickerProps = {
  rimDiameters: number[]
  selectedRim: number
  onRimChange: (rim: number) => void

  sizes: TireSizeOption[]
  selectedSize: TireSizeOption | undefined
  onSizeChange: (sizeLabel: string) => void
}

// "last few sets" was wrong — a size at/under the low-stock threshold (default
// 4 units) is at most 1 set, not several (WB-090 P2/P18).
const AVAILABILITY_LABEL: Record<TireSizeOption["availability"], string> = {
  in_stock: `In stock — ${SHIP_LEAD_TIME}`,
  low_stock: "Low stock — only a few left",
  out_of_stock: "Out of stock",
}

/**
 * Two stacked rows: a rim-diameter chip row (gates which sizes are listed
 * below) and the size list for the selected rim. A SIMPLIFIED mirror of the
 * wheel VariantPicker — single Size axis only, no bolt pattern / offset /
 * bore / load rows. Mirrors its button styling, per-cell hover Tooltip, and
 * the bold Display stat readout at the bottom.
 */
const TireSizePicker = ({
  rimDiameters,
  selectedRim,
  onRimChange,
  sizes,
  selectedSize,
  onSizeChange,
}: TireSizePickerProps) => {
  // WB-090 P16: when EVERY size in the grid is sold out, an availability-
  // gated `active` would never highlight any cell — the shopper's actual
  // selection becomes visually invisible even though `selectedSize` still
  // holds a real value. Surface it honestly with an explicit banner instead
  // (mirrors the wheel VariantPicker).
  const allOutOfStock =
    sizes.length > 0 && sizes.every((s) => s.availability === "out_of_stock")
  return (
    <div className="flex flex-col gap-5">
      {/* Rim diameter row — hidden when there's nothing meaningful to choose. */}
      {rimDiameters.length > 1 && (
        <div>
          <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
            Rim diameter
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {rimDiameters.map((rim) => {
              const active = rim === selectedRim
              return (
                <button
                  key={rim}
                  type="button"
                  onClick={() => onRimChange(rim)}
                  aria-pressed={active}
                  className={cn(
                    "h-10 px-4 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
                    active
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                      : "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
                  )}
                >
                  {rim}&quot;
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Size list, scoped to the selected rim. */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <Label tone="muted">Size</Label>
          <span className="text-[11px] font-[var(--mono)] text-[var(--ink-soft)]">
            {sizes.length} {sizes.length === 1 ? "size" : "sizes"}
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
        <div className="grid grid-cols-2 gap-1.5">
          {sizes.map((s) => {
            // Gate purely on the sizeLabel match (WB-090 P15/P16 edge) — a
            // selected size that's OOS (e.g. still reachable after a rim
            // switch that keeps the same size, which is out of stock at
            // that rim) must still render as the selected cell. The
            // `disabled && !active` styling below already yields to
            // `active`, so this alone is sufficient.
            const active = selectedSize?.sizeLabel === s.sizeLabel
            const disabled = s.availability === "out_of_stock"
            return (
              <Tooltip key={s.sizeLabel}>
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
                      onSizeChange(s.sizeLabel)
                    }}
                    aria-pressed={active}
                    className={cn(
                      "relative h-14 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5",
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
                    {s.sizeLabel}
                    {s.availability === "low_stock" && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 right-1.5 inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: active ? "white" : "var(--orange)" }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-semibold">{s.sizeLabel}</div>
                  <div className="text-[10px] opacity-80">
                    {s.loadIndex != null
                      ? `Load ${s.loadIndex}${s.speedRating ?? ""} · `
                      : ""}
                    {AVAILABILITY_LABEL[s.availability]}
                  </div>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Selected-size stat readout — mirrors the wheel VariantPicker's bold
          Display stat tiles (the rim/width/aspect are already encoded in the
          size label + the specs grid below, so the additive facts here are
          load index + stock status). */}
      {selectedSize && (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--hairline)]">
          {selectedSize.loadIndex != null && (
            <Stat
              label="Load index"
              value={`${selectedSize.loadIndex}${selectedSize.speedRating ?? ""}`}
            />
          )}
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
      )}
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

export default TireSizePicker
