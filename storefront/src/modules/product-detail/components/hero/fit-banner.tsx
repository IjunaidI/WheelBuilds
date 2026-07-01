"use client"

import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type FitBannerProps = {
  /** true = currently showing only fitting options; false = showing everything. */
  filtered: boolean
  vehicleLabel: string
  onShowAll: () => void
  onOnlyFit: () => void
}

/**
 * The fit-mode banner above the variant picker. When filtered, offers "Show all"
 * behind a one-time confirmation that the extra options may not fit. When showing
 * all, offers "Only show what fits". The acknowledgement is per-PDP-visit.
 */
const FitBanner = ({ filtered, vehicleLabel, onShowAll, onOnlyFit }: FitBannerProps) => {
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)

  const requestShowAll = () => (ack ? onShowAll() : setOpen(true))
  const confirm = () => {
    setAck(true)
    setOpen(false)
    onShowAll()
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3 text-[13px]"
      style={{ borderColor: "var(--hairline)", background: "rgba(255,106,0,0.04)" }}
    >
      <span className="text-[var(--ink)]">
        {filtered
          ? `Showing only sizes, patterns & colors that fit your ${vehicleLabel}`
          : `Showing everything — options here may NOT fit your ${vehicleLabel}`}
      </span>
      {filtered ? (
        <button type="button" onClick={requestShowAll}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] text-[var(--orange)] underline">
          Show all
        </button>
      ) : (
        <button type="button" onClick={onOnlyFit}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] text-[var(--orange)] underline">
          Only show what fits
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>These won&apos;t fit your {vehicleLabel}.</DialogTitle>
            <DialogDescription>
              Showing everything reveals bolt patterns, widths, and sizes OUTSIDE your vehicle&apos;s
              fitment — they will not fit. Only continue if you know exactly what you&apos;re doing.
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
