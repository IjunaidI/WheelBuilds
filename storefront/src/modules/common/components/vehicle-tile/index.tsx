"use client"

import Icon from "@modules/common/components/icon"
import { cn } from "@/lib/utils"

type VehicleTileProps = {
  /** Step number rendered as "STEP 0{idx}" in the mono label. */
  idx: string
  /** Axis name: "Year", "Make", "Model", "Trim". */
  label: string
  /** Selected value. When undefined, renders the "Pick {label}" placeholder. */
  value?: string
  onClick: () => void
  /** Size preset. `lg` = the hero's giant tile (110px tall). `md` = drawer/page-inline (80px). */
  size?: "lg" | "md"
  className?: string
}

/**
 * The big YMM tile button used in the hero and (incrementally) in the YMM
 * pane of the search drawer. When `value` is set the tile shows the value in
 * Display type with a small orange underline; when empty it shows a "Pick year"
 * style prompt in muted text. Always opens the search drawer (or whatever the
 * parent wires `onClick` to).
 */
const VehicleTile = ({
  idx,
  label,
  value,
  onClick,
  size = "lg",
  className,
}: VehicleTileProps) => {
  const hasValue = Boolean(value)
  const isLg = size === "lg"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "vehicle-tile",
        !hasValue && "inactive",
        className
      )}
      style={isLg ? undefined : { padding: "14px 16px", minHeight: 80 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            color: "var(--ink-soft)",
          }}
        >
          STEP 0{idx} · {label.toUpperCase()}
        </span>
        <Icon
          name="chevron-down"
          size={isLg ? 14 : 12}
          color={hasValue ? "#FF6A00" : "#8A8A8E"}
        />
      </div>
      <div>
        <div
          style={{
            fontFamily: "var(--display)",
            fontWeight: 900,
            fontSize: hasValue ? (isLg ? 36 : 22) : isLg ? 22 : 16,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: hasValue ? "var(--ink)" : "var(--ink-soft)",
            lineHeight: 1,
          }}
        >
          {value ?? `Pick ${label.toLowerCase()}`}
        </div>
        {hasValue && (
          <div
            aria-hidden
            style={{
              height: 2,
              width: 28,
              background: "var(--orange)",
              marginTop: 10,
            }}
          />
        )}
      </div>
    </button>
  )
}

export default VehicleTile
