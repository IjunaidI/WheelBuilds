"use client"

import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type FitBannerProps = {
  /** true = currently showing only fitting options; false = showing everything. */
  filtered: boolean
  /**
   * WB-077 I1: true when the filtered set is entirely check-tier — bolt pattern
   * and hub bore clear, but EVERY shown size sits outside the vehicle's typical
   * spec window. The banner then renders honest amber "verify clearance" copy
   * instead of claiming the shown options fit. When false, at least one shown
   * option is a genuine full match (the unchanged "fits" path).
   */
  aggressive?: boolean
  vehicleLabel: string
  onShowAll: () => void
  onOnlyFit: () => void
}

/**
 * The fit-mode banner above the variant picker. When filtered, offers "Show all"
 * behind a one-time confirmation that the extra options may not fit. When showing
 * all, offers "Only show what fits". The acknowledgement is per-PDP-visit.
 *
 * Two filtered flavors (WB-077 I1): a genuine "fits" set reads orange "options
 * that fit"; a check-only "aggressive" set reads amber "verify clearance" (the
 * #B8860B convention shared with the CHECK FIT chip + fitment band) because
 * none of the shown sizes are confirmed to fit.
 */
const FitBanner = ({ filtered, aggressive = false, vehicleLabel, onShowAll, onOnlyFit }: FitBannerProps) => {
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)

  const requestShowAll = () => (ack ? onShowAll() : setOpen(true))
  const confirm = () => {
    setAck(true)
    setOpen(false)
    onShowAll()
  }

  // Amber (check) treatment only while filtered AND aggressive; otherwise the
  // existing orange accent (fits, or the "showing everything" warning state).
  const amber = filtered && aggressive
  const linkColor = amber ? "#8A6508" : "var(--orange-deep)"

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3 text-[13px]"
      style={
        amber
          ? { borderColor: "rgba(184,134,11,0.35)", background: "rgba(184,134,11,0.06)" }
          : { borderColor: "var(--hairline)", background: "rgba(255,106,0,0.04)" }
      }
    >
      <span className="text-[var(--ink)]">
        {filtered
          ? aggressive
            ? `Showing aggressive-fit options for your ${vehicleLabel} — verify clearance before ordering`
            : `Showing only options that fit your ${vehicleLabel}`
          : `Showing everything — options here may NOT fit your ${vehicleLabel}`}
      </span>
      {filtered ? (
        <button type="button" onClick={requestShowAll}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] underline"
          style={{ color: linkColor }}>
          Show all
        </button>
      ) : (
        <button type="button" onClick={onOnlyFit}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] underline"
          style={{ color: linkColor }}>
          {aggressive ? "Only show aggressive fits" : "Only show what fits"}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {aggressive
                ? `Show more than the aggressive fits for your ${vehicleLabel}?`
                : `These won't fit your ${vehicleLabel}.`}
            </DialogTitle>
            <DialogDescription>
              {aggressive
                ? "The options shown are aggressive fitments — bolt pattern and bore clear, but they sit OUTSIDE your vehicle's typical size window, so verify clearance before ordering. Show all also reveals sizes that do not fit your vehicle at all."
                : "Showing everything reveals options OUTSIDE your vehicle's fitment — they will not fit. Only continue if you know exactly what you're doing."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirm}>Show all anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FitBanner
