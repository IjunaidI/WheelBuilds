"use client"

import { useState } from "react"
import Tab from "./tab"
import GaragePane from "./garage-pane"
import YmmPane from "./ymm-pane"
import { useGarage } from "@lib/garage/use-garage"

type Mode = "garage" | "manual"

type FindByVehicleProps = {
  onClose: () => void
}

const FindByVehicle = ({ onClose }: FindByVehicleProps) => {
  const { vehicles } = useGarage()
  const [mode, setMode] = useState<Mode>(
    vehicles.length > 0 ? "garage" : "manual"
  )

  const garageSub =
    vehicles.length === 0
      ? "No vehicles yet"
      : vehicles.length === 1
        ? "1 saved vehicle"
        : `${vehicles.length} saved vehicles`

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
            color: "var(--muted)",
            fontFamily: "var(--mono)",
            letterSpacing: "0.04em",
          }}
        >
          Fitment guaranteed
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Tab
          id="garage"
          active={mode === "garage"}
          label="From My Garage"
          sub={garageSub}
          onClick={() => setMode("garage")}
        />
        <Tab
          id="manual"
          active={mode === "manual"}
          label="Year / Make / Model"
          sub="One-time lookup"
          onClick={() => setMode("manual")}
        />
      </div>

      {mode === "garage" ? (
        <GaragePane onClose={onClose} onAddNew={() => setMode("manual")} />
      ) : (
        <YmmPane onClose={onClose} />
      )}
    </div>
  )
}

export default FindByVehicle
