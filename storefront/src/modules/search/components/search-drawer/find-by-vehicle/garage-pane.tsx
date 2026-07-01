"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the fit navigation shows the top progress bar
import { toast } from "sonner"
import Icon from "@modules/common/components/icon"
import Spinner from "@modules/common/icons/spinner"
import Chip from "@modules/common/components/chip"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { getFitmentByVehicle } from "@lib/data/fitment"
import { Vehicle, NewVehicle } from "@lib/garage/types"

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
  if (v.canonicalBoltPatterns?.length) parts.push(v.canonicalBoltPatterns[0])
  if (v.hubBoreMm) parts.push(`${v.hubBoreMm} hub`)
  if (v.notes) parts.push(v.notes)
  return parts.length ? parts.join(" · ") : formatSavedDate(v.savedAt)
}

const GaragePane = ({ onClose, onAddNew }: GaragePaneProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const { vehicles, active, setActive, remove, add, update } = useGarage()
  const [selectingId, setSelectingId] = useState<string | null>(null)

  const selectVehicle = async (id: string) => {
    const v = vehicles.find((veh) => veh.id === id)
    if (!v) return
    setActive(id)

    let patterns = v.canonicalBoltPatterns ?? []
    // A saved vehicle that was added before its fitment resolved (or whose
    // fitment didn't persist) has no stored bolt patterns. Re-resolve it from
    // the vehicle's identity so the garage tab applies the fit exactly like the
    // Year/Make/Model tab does — instead of silently dropping to /store.
    if (!(v.fitmentStatus === "ok" && patterns.length)) {
      setSelectingId(id)
      try {
        const fitment = await getFitmentByVehicle(
          v.make,
          v.model,
          v.modificationSlug ?? "",
          String(v.year),
          "usdm"
        )
        if (fitment && !("error" in fitment)) {
          update(id, {
            canonicalBoltPatterns: fitment.canonicalBoltPatterns,
            hubBoreMm: fitment.hubBoreMm ?? undefined,
            diameterWindow: fitment.diameterWindow,
            widthWindow: fitment.widthWindow,
            offsetWindow: fitment.offsetWindow,
            fitmentStatus: fitment.status,
          })
          if (fitment.status === "ok" && fitment.canonicalBoltPatterns.length) {
            patterns = fitment.canonicalBoltPatterns
          } else {
            toast("No fitment data for this vehicle yet", {
              description:
                "We couldn't find wheel specs for it — showing the full catalog.",
            })
          }
        } else if (fitment && "error" in fitment) {
          toast.error("Fitment temporarily unavailable", {
            description: "Please contact support.",
          })
        }
      } finally {
        setSelectingId(null)
      }
    }

    const fitParam = patterns.length ? `?fit=${patterns.join(",")}` : ""
    onClose()
    router.push(`/${countryCode}/store${fitParam}`)
  }

  const removeVehicle = (v: Vehicle) => {
    const label = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")
    // Snapshot the fields needed to restore — strip id + savedAt so the undo path
    // creates a new vehicle via add() (which assigns a fresh id and timestamp).
    const restore: NewVehicle = {
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      modificationSlug: v.modificationSlug,
      canonicalBoltPatterns: v.canonicalBoltPatterns,
      hubBoreMm: v.hubBoreMm,
      diameterWindow: v.diameterWindow,
      widthWindow: v.widthWindow,
      offsetWindow: v.offsetWindow,
      fitmentStatus: v.fitmentStatus,
      notes: v.notes,
    }
    remove(v.id)
    toast(`Removed ${label}`, {
      action: {
        label: "Undo",
        onClick: () => add(restore),
      },
    })
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
        <Button onClick={onAddNew} size="sm">
          Add your first vehicle
        </Button>
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
              disabled={selectingId !== null}
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
                aria-hidden
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
                    <Chip variant="accent" size="sm" className="px-2 py-0 text-[9px] uppercase">
                      ACTIVE
                    </Chip>
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
              {selectingId === v.id ? (
                <Spinner size="16" color="#8A8A8E" />
              ) : (
                <Icon name="arrow-right" size={16} color="#8A8A8E" />
              )}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeVehicle(v)}
              aria-label={`Remove ${label}`}
              title="Remove"
              className="h-7 w-7 text-[var(--ink-soft)]"
            >
              <Icon name="x" size={14} />
            </Button>
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
