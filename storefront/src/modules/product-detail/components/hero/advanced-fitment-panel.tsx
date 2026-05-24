"use client"

import { useState } from "react"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import { OffsetVariant } from "../../data/types"
import OffsetDiagram from "./offset-diagram"

type AdvancedFitmentPanelProps = {
  /** "20×9" style label for the header readout. */
  sizeLabel: string
  /** All ET options for the current size. */
  offsetVariants: OffsetVariant[]
  /** The currently selected ET. */
  selectedOffsetMm: number
  /** The OEM-recommended ET (gets the orange badge in the chip row). */
  oemOffsetMm?: number
  /** Called when the user picks a different ET. */
  onSelectOffset: (mm: number) => void
}

/**
 * Collapsed "Technical fitment" disclosure for wheel-spec enthusiasts.
 * Default for everyone is the AutoFitmentCard above this — this is the only
 * way to override the OEM offset. One click reveals offset chips, a top-down
 * cross-section diagram, the per-offset spec grid, and an inline explainer.
 */
const AdvancedFitmentPanel = ({
  sizeLabel,
  offsetVariants,
  selectedOffsetMm,
  oemOffsetMm,
  onSelectOffset,
}: AdvancedFitmentPanelProps) => {
  const [open, setOpen] = useState(false)

  if (offsetVariants.length === 0) return null

  const current =
    offsetVariants.find((o) => o.value === selectedOffsetMm) ?? offsetVariants[0]
  const isOem = selectedOffsetMm === oemOffsetMm

  return (
    <div
      className="rounded-[var(--radius)]"
      style={{
        border: "1px dashed var(--hairline)",
        background: open ? "var(--soft)" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-3.5 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2.5 flex-wrap">
          <span
            className="font-[var(--mono)] text-[10px] tracking-[0.08em] text-[var(--orange)] px-1.5 py-0.5 rounded-sm"
            style={{ background: "rgba(255,106,0,0.08)" }}
          >
            PRO
          </span>
          <span className="text-[13px] font-semibold text-[var(--ink)]">
            Technical fitment
          </span>
          <span className="text-[11px] text-[var(--ink-soft)] font-[var(--mono)] tracking-[0.04em]">
            Override offset, backspace, clearance
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          strokeWidth={2}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
          }}
        />
      </button>

      {open && (
        <div className="px-3.5 pb-4 pt-1">
          <div className="flex justify-between items-baseline mb-2">
            <Label tone="ink" style={{ fontSize: 10 }}>
              Offset (ET)
            </Label>
            <a
              href="#"
              className="text-[11px] text-[var(--graphite)] underline underline-offset-2"
            >
              What is offset?
            </a>
          </div>
          <div className="flex gap-1.5 mb-3.5">
            {offsetVariants.map((o) => {
              const sel = o.value === selectedOffsetMm
              const oem = o.value === oemOffsetMm
              return (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => onSelectOffset(o.value)}
                  className="flex-1 relative rounded-[4px] px-2 py-2.5 font-[var(--display)] font-black text-[16px]"
                  style={{
                    background: sel ? "var(--ink)" : "white",
                    color: sel ? "white" : "var(--ink)",
                    border: "1px solid",
                    borderColor: sel ? "var(--ink)" : "var(--hairline)",
                  }}
                >
                  +{o.value}
                  <span className="text-[10px] opacity-60 ml-0.5">MM</span>
                  {oem && (
                    <span
                      className="absolute -top-1.5 -right-1 font-[var(--mono)] text-[8px] font-bold tracking-[0.08em] text-white px-1.5 py-0.5 rounded-sm"
                      style={{ background: "var(--orange)" }}
                    >
                      OEM
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div
            className="rounded-[4px] px-3.5 pt-3 pb-2 bg-white"
            style={{ border: "1px solid var(--hairline)" }}
          >
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[11px] font-semibold text-[var(--ink)]">
                Cross-section · top-down
              </span>
              <span className="font-[var(--mono)] text-[10px] text-[var(--ink-soft)] tracking-[0.04em]">
                {sizeLabel} · ET +{selectedOffsetMm}
              </span>
            </div>
            <OffsetDiagram value={selectedOffsetMm} />
          </div>

          <div
            className="grid grid-cols-4 gap-px mt-3 rounded-[4px] overflow-hidden"
            style={{ background: "var(--hairline)", border: "1px solid var(--hairline)" }}
          >
            {[
              { l: "Offset (ET)", v: `+${current.value}mm` },
              { l: "Backspace", v: current.backspaceIn },
              { l: "Lip depth", v: current.lipDepthIn ?? "—" },
              { l: "Hub-to-lock", v: current.hubToLockIn ?? "—" },
            ].map((s) => (
              <div key={s.l} className="bg-white px-3 py-2.5">
                <div className="text-[9px] font-[var(--mono)] font-semibold uppercase tracking-[0.06em] text-[var(--orange)] mb-1">
                  {s.l}
                </div>
                <div className="font-[var(--display)] font-black text-[16px] text-[var(--ink)]">
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-3 px-3 py-2.5 bg-white text-[12px] text-[var(--graphite)] leading-[1.5]"
            style={{ borderLeft: "2px solid var(--orange)" }}
          >
            <strong className="text-[var(--ink)]">Offset</strong> is the
            distance from the wheel&apos;s centerline to its mounting pad.
            Positive ET tucks the wheel inboard (toward the suspension); lower
            ET pushes it out toward the fender.{" "}
            {isOem
              ? "You're on the OEM-matched offset — fully cleared."
              : "This is an override — may require minor fender liner trim. Pros approved."}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvancedFitmentPanel
