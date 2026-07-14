"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { useTireQuery } from "../../use-tire-query"

/**
 * Rendered when the current filter combination returns 0 results. Mirrors the
 * wheel empty-state (modules/discovery/components/empty-state): when the empty
 * result is driven by a vehicle fitment filter (`?fit=<sizes>`), we say so
 * explicitly ("no tires fit your <vehicle>") and the recovery turns fitment
 * OFF (fit=0) — bare /tires would just get the active vehicle's fit re-applied
 * by TireFitmentSync.
 */
const TireEmpty = () => {
  const { clearAll, q } = useTireQuery()
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const fit = sp.get("fit")
  const fitActive = !!fit && fit !== "0"
  const vehicleLabel = active
    ? [active.year, active.make, active.model].filter(Boolean).join(" ")
    : null

  // Turn fitment off without dropping the user's other filters. fit=0 is the
  // explicit opt-out TireFitmentSync never overrides.
  const turnOffFit = () => {
    const n = new URLSearchParams(Array.from(sp.entries()))
    n.set("fit", "0")
    n.delete("page")
    router.replace(`${pathname}?${n.toString()}`)
  }

  // Clears only the free-text search term (WB-087 D3), leaving any other
  // active filters intact.
  const clearQuery = () => {
    const n = new URLSearchParams(Array.from(sp.entries()))
    n.delete("q")
    n.delete("page")
    router.replace(`${pathname}?${n.toString()}`)
  }

  if (fitActive) {
    const who = vehicleLabel ? `your ${vehicleLabel}` : "this vehicle"
    return (
      <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
        <div
          aria-hidden
          style={{ opacity: 0.4 }}
          className="h-[140px] w-[140px] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
        />
        <Label tone="muted">NO FITTING TIRES</Label>
        <Display size={28} as="h2">
          No tires in our catalog fit {who} yet.
        </Display>
        <p className="text-[14px] text-[var(--graphite)] max-w-[420px]">
          Nothing in stock matches this vehicle&apos;s factory tire size right
          now. Turn off the vehicle filter to browse the full catalog.
        </p>
        <Button onClick={turnOffFit} className="mt-2">
          See all tires
        </Button>
      </div>
    )
  }

  if (q) {
    return (
      <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
        <div
          aria-hidden
          style={{ opacity: 0.4 }}
          className="h-[140px] w-[140px] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
        />
        <Label tone="muted">NO MATCHES</Label>
        <Display size={28} as="h2">
          No results for &quot;{q}&quot;
        </Display>
        <p className="text-[14px] text-[var(--graphite)] max-w-[400px]">
          Try a different search, or clear it to browse the full catalog.
        </p>
        <Button onClick={clearQuery} className="mt-2">
          Clear search
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
      <div
        aria-hidden
        style={{ opacity: 0.4 }}
        className="h-[140px] w-[140px] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
      />
      <Label tone="muted">NO MATCHES</Label>
      <Display size={28} as="h2">
        No tires match these filters.
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[400px]">
        Try widening your selection — maybe drop the size or rim diameter
        constraint, or clear everything and start over.
      </p>
      <Button onClick={clearAll} className="mt-2">
        Clear all filters
      </Button>
    </div>
  )
}

export default TireEmpty
