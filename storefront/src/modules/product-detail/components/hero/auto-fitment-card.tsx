"use client"

import Icon from "@modules/common/components/icon"

type AutoFitmentCardProps = {
  /** "20×9" style label. */
  sizeLabel: string
  /** Currently selected ET. */
  offsetMm: number
  /** Backspace string, e.g. `5.65"`. */
  backspaceIn?: string
  /** Whether the current offset matches OEM spec. False = override. */
  isOem: boolean
  /** Called when user clicks "Reset to OEM" (only shown when !isOem). */
  onResetToOem: () => void
}

/**
 * Auto-fit confirmation surface: shows that the offset was auto-picked to OEM
 * spec for the chosen size, or — if the user overrode via the technical
 * disclosure — flips to an amber "Custom fitment override" state with a
 * one-click reset.
 */
const AutoFitmentCard = ({
  sizeLabel,
  offsetMm,
  backspaceIn,
  isOem,
  onResetToOem,
}: AutoFitmentCardProps) => (
  <div
    className="flex items-center gap-3.5 rounded-[var(--radius)] border px-4 py-3.5"
    style={{
      background: isOem ? "rgba(255,106,0,0.04)" : "rgba(184,134,11,0.06)",
      borderColor: isOem ? "rgba(255,106,0,0.25)" : "rgba(184,134,11,0.35)",
    }}
  >
    <span
      className="inline-flex items-center justify-center rounded shrink-0"
      style={{
        width: 36,
        height: 36,
        background: "white",
        border: "1px solid var(--hairline)",
      }}
    >
      <Icon
        name={isOem ? "check" : "shield"}
        size={16}
        color={isOem ? "#FF6A00" : "#B8860B"}
        strokeWidth={2.5}
      />
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-semibold text-[var(--ink)]">
        {isOem ? "Auto-fitted to OEM spec" : "Custom fitment override"}
      </div>
      <div className="text-[12px] text-[var(--graphite)] mt-0.5 font-[var(--mono)] tracking-[0.03em]">
        {sizeLabel.toUpperCase()} · ET {offsetMm >= 0 ? "+" : ""}
        {offsetMm}MM
        {backspaceIn && ` · ${backspaceIn} BS`}
      </div>
    </div>
    {!isOem && (
      <button
        type="button"
        onClick={onResetToOem}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--orange)] hover:bg-[rgba(255,106,0,0.06)] rounded shrink-0"
      >
        <Icon name="return" size={12} color="#FF6A00" strokeWidth={2.5} />
        Reset to OEM
      </button>
    )}
  </div>
)

export default AutoFitmentCard
