"use client"

import { cn } from "@/lib/utils"
import Label from "@modules/common/components/label"
import { TireSizeOption } from "../../../data/types"

type TireSizePickerProps = {
  rimDiameters: number[]
  selectedRim: number
  onRimChange: (rim: number) => void

  sizes: TireSizeOption[]
  selectedSize: TireSizeOption | undefined
  onSizeChange: (sizeLabel: string) => void
}

/** "Section width 225mm · Aspect 45 · Rim 17" · Load 91V" — omits any null field. */
function specReadout(s: TireSizeOption): string {
  const parts: string[] = []
  if (s.sectionWidthMm != null) parts.push(`Section width ${s.sectionWidthMm}mm`)
  if (s.aspectRatio != null) parts.push(`Aspect ${s.aspectRatio}`)
  parts.push(`Rim ${s.rimDiameterIn}"`)
  if (s.loadIndex != null) parts.push(`Load ${s.loadIndex}${s.speedRating ?? ""}`)
  return parts.join(" · ")
}

/**
 * Two stacked rows: a rim-diameter chip row (gates which sizes are listed
 * below) and the size list for the selected rim. A SIMPLIFIED mirror of the
 * wheel VariantPicker — single Size axis only, no bolt pattern / offset /
 * bore / load rows. Mirrors its button styling.
 */
const TireSizePicker = ({
  rimDiameters,
  selectedRim,
  onRimChange,
  sizes,
  selectedSize,
  onSizeChange,
}: TireSizePickerProps) => {
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
        <div className="grid grid-cols-2 gap-1.5">
          {sizes.map((s) => {
            const active = selectedSize?.sizeLabel === s.sizeLabel
            const disabled = s.availability === "out_of_stock"
            return (
              <button
                key={s.sizeLabel}
                type="button"
                disabled={disabled}
                onClick={() => onSizeChange(s.sizeLabel)}
                aria-pressed={active}
                className={cn(
                  "relative h-14 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5",
                  active &&
                    !disabled &&
                    "border-[var(--orange)] bg-[var(--orange)] text-white",
                  !active &&
                    !disabled &&
                    "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]",
                  disabled &&
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
            )
          })}
        </div>
      </div>

      {/* Selected-size spec readout. */}
      {selectedSize && (
        <div className="pt-4 border-t border-[var(--hairline)]">
          <Label tone="muted" style={{ fontSize: 10, display: "block", marginBottom: 4 }}>
            Spec
          </Label>
          <div className="text-[13px] text-[var(--ink)]">{specReadout(selectedSize)}</div>
        </div>
      )}
    </div>
  )
}

export default TireSizePicker
