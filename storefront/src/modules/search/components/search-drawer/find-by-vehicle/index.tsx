"use client"

// GARAGE-DISABLED (WB-076): the saved-vehicles garage is retired. The pane
// pair (From My Garage / Year-Make-Model tabs via ./tab and ./garage-pane —
// both files kept intact for restoration) collapsed to the YMM picker plus a
// current-vehicle row. One vehicle lives in the browser cache; picking a new
// one replaces it.
import { useState } from "react"
import { toast } from "sonner"
import Spinner from "@modules/common/icons/spinner"
import YmmPane from "./ymm-pane"
import { useGarage } from "@lib/garage/use-garage"
import { resolveFitmentForVehicle } from "@lib/data/fitment-resolve"
import { getFitmentContext } from "@lib/stores/fitment-context"
import { slugifyYmm } from "@lib/garage/vehicle-data"
import { FitmentTarget } from "./destination-url"

type FindByVehicleProps = {
  onClose: () => void
}

const FindByVehicle = ({ onClose }: FindByVehicleProps) => {
  const { active, remove, update } = useGarage()
  const [rechecking, setRechecking] = useState(false)
  // Same "which surface is this for" signal ymm-pane/garage-pane read — only
  // used here to word the "did we find a fit?" toast for the right catalog.
  const [target] = useState<FitmentTarget>(() => getFitmentContext())

  // The real retry path for a vehicle that got saved+activated but never
  // resolved a fitment window (N5/N7) — e.g. the wheel-size lookup 503'd or
  // threw when the vehicle was first added. The `garage-pane.tsx` comment
  // this used to point to ("selecting it again re-resolves") is dead: that
  // pane is orphaned and not rendered anywhere, so a stuck vehicle used to
  // have no way back. Reuses the same resolveFitmentForVehicle + update()
  // call shape ymm-pane's submit() uses.
  //
  // A vehicle picked while the live wheel-size catalog was down (or never
  // resolved for any other reason) stores the seed's DISPLAY name (e.g.
  // "Silverado 1500") as make/model — ymm-pane's submit() only slugifies
  // when it knows the field is seed-backed, but we don't have that context
  // here for an already-stored vehicle. slugifyYmm is idempotent on real
  // slugs ("f-150" -> "f-150"), so applying it unconditionally is safe for
  // live-catalog vehicles and fixes the seed case — otherwise re-sending the
  // stored display name would just resolve to nothing again, defeating the
  // recovery this button exists for.
  const recheckFit = async () => {
    if (!active || rechecking) return
    setRechecking(true)
    try {
      const result = await resolveFitmentForVehicle(
        slugifyYmm(active.make),
        slugifyYmm(active.model),
        active.modificationSlug ?? "",
        String(active.year),
        "usdm"
      )
      switch (result.kind) {
        case "ok": {
          const fitment = result.fitment
          update(active.id, {
            canonicalBoltPatterns: fitment.canonicalBoltPatterns,
            hubBoreMm: fitment.hubBoreMm ?? undefined,
            diameterWindow: fitment.diameterWindow,
            widthWindow: fitment.widthWindow,
            offsetWindow: fitment.offsetWindow,
            oemTireSizes: fitment.oemTireSizes,
            oemTires: fitment.oemTires,
            fitmentStatus: fitment.status,
          })
          const hasFit =
            target === "tires"
              ? (fitment.oemTireSizes?.length ?? 0) > 0
              : fitment.status === "ok" && fitment.canonicalBoltPatterns.length > 0
          if (hasFit) {
            toast.success("Fit updated")
          } else {
            toast(
              target === "tires"
                ? "No tire fitment for this vehicle yet"
                : "No fitment data for this vehicle yet",
              {
                description:
                  target === "tires"
                    ? "We couldn't find factory tire sizes for it — showing all tires."
                    : "We couldn't find wheel specs for it — showing the full catalog.",
              }
            )
          }
          break
        }
        case "unavailable":
        case "failed":
          // Same honest, no-fake-navigation handling as ymm-pane's failure
          // paths (N5/N7): stay put, tell the user plainly, let them press
          // the button again — never silently claim success.
          toast.error("Fitment temporarily unavailable — please try again.")
          break
      }
    } finally {
      setRechecking(false)
    }
  }

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
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            {!active.canonicalBoltPatterns?.length && (
              <button
                type="button"
                onClick={recheckFit}
                disabled={rechecking}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  letterSpacing: "0.04em",
                  color: "var(--orange-deep)",
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: rechecking ? "default" : "pointer",
                  opacity: rechecking ? 0.6 : 1,
                }}
                aria-label="Re-check fit for the current vehicle"
              >
                {rechecking && <Spinner size="12" color="var(--orange)" />}
                RE-CHECK FIT
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(active.id)}
              style={{
                fontSize: 11,
                fontFamily: "var(--mono)",
                letterSpacing: "0.04em",
                color: "var(--ink-soft)",
                textDecoration: "underline",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
              aria-label="Clear the current vehicle"
            >
              CLEAR
            </button>
          </div>
        </div>
      )}

      <YmmPane onClose={onClose} />
    </div>
  )
}

export default FindByVehicle
