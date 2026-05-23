"use client"

import { useRouter, useParams } from "next/navigation"
import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import { Vehicle } from "@lib/garage/types"

type GaragePaneProps = {
  onClose: () => void
  onAddNew: () => void
}

const formatSavedDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `Saved ${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
}

const formatSpecs = (v: Vehicle): string => {
  const parts: string[] = []
  if (v.boltPattern) parts.push(v.boltPattern)
  if (v.hubBore) parts.push(`${v.hubBore} hub`)
  if (v.notes) parts.push(v.notes)
  return parts.length ? parts.join(" Â· ") : formatSavedDate(v.savedAt)
}

const GaragePane = ({ onClose, onAddNew }: GaragePaneProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const { vehicles, active, setActive, remove } = useGarage()

  const selectVehicle = (id: string) => {
    setActive(id)
    onClose()
    router.push(`/${countryCode}/store`)
  }

  if (vehicles.length === 0) {
    return (
      <div
        style={{
          padding: "20px 16px",
          textAlign: "center",
          border: "1px dashed var(--hairline)",
          borderRadius: 4,
          background: "var(--soft)",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--graphite)", marginBottom: 12 }}>
          No vehicles saved yet.
        </div>
        <button
          type="button"
          onClick={onAddNew}
          className="btn btn-primary"
          style={{ height: 40, padding: "0 18px", fontSize: 12 }}
        >
          Add your first vehicle
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {vehicles.map((v) => {
        const isActive = active?.id === v.id
        const label = [v.year, v.make, v.model, v.trim]
          .filter(Boolean)
          .join(" ")
        return (
          <div
            key={v.id}
            style={{
              background: isActive ? "rgba(255,106,0,0.04)" : "white",
              border: "1px solid",
              borderColor: isActive ? "var(--orange)" : "var(--hairline)",
              borderRadius: 4,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <button
              type="button"
              onClick={() => selectVehicle(v.id)}
              aria-label={`Use ${label}`}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: "var(--soft)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  border: "1px solid var(--hairline)",
                }}
              >
                <Icon name="garage" size={18} strokeWidth={1.6} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {label}
                  </span>
                  {isActive && (
                    <span
                      className="fits-chip"
                      style={{ fontSize: 9, height: 18, padding: "0 6px" }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    fontFamily: "var(--mono)",
                    marginTop: 4,
                  }}
                >
                  {formatSpecs(v)}
                </div>
              </div>
              <Icon name="arrow-right" size={16} color="#8A8A8E" />
            </button>
            <button
              type="button"
              onClick={() => remove(v.id)}
              aria-label={`Remove ${label}`}
              title="Remove"
              style={{
                background: "none",
                border: "none",
                padding: 4,
                cursor: "pointer",
                color: "var(--ink-soft)",
                display: "inline-flex",
                flexShrink: 0,
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAddNew}
        style={{
          background: "white",
          border: "1px dashed var(--hairline)",
          borderRadius: 4,
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--graphite)",
          fontFamily: "inherit",
        }}
      >
        + Add a new vehicle to garage
      </button>
    </div>
  )
}

export default GaragePane
