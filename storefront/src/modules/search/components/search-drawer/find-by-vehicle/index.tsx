"use client"

// GARAGE-DISABLED (WB-076): the saved-vehicles garage is retired. The pane
// pair (From My Garage / Year-Make-Model tabs via ./tab and ./garage-pane —
// both files kept intact for restoration) collapsed to the YMM picker plus a
// current-vehicle row. One vehicle lives in the browser cache; picking a new
// one replaces it.
import YmmPane from "./ymm-pane"
import { useGarage } from "@lib/garage/use-garage"

type FindByVehicleProps = {
  onClose: () => void
}

const FindByVehicle = ({ onClose }: FindByVehicleProps) => {
  const { active, remove } = useGarage()

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          className="label"
          style={{ color: "var(--ink)" }}
        >
          Find by Vehicle
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-soft)",
            fontFamily: "var(--mono)",
            letterSpacing: "0.04em",
          }}
        >
          Fitment guaranteed
        </span>
      </div>

      {active && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 14,
            padding: "10px 12px",
            border: "1px solid var(--hairline)",
            borderRadius: 8,
            background: "var(--soft)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--graphite)" }}>
            Current vehicle:{" "}
            <strong style={{ color: "var(--ink)" }}>
              {active.year} {active.make} {active.model}
              {active.trim ? ` ${active.trim}` : ""}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => remove(active.id)}
            style={{
              fontSize: 11,
              fontFamily: "var(--mono)",
              letterSpacing: "0.04em",
              color: "var(--ink-soft)",
              textDecoration: "underline",
            }}
            aria-label="Clear the current vehicle"
          >
            CLEAR
          </button>
        </div>
      )}

      <YmmPane onClose={onClose} />
    </div>
  )
}

export default FindByVehicle
