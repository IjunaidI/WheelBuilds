"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Wheel from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { useDiscoveryQuery } from "../../data/use-discovery-query"

/**
 * Rendered when the current filter combination returns 0 results. When the
 * empty result is driven by a vehicle fitment filter (`?fit=<patterns>`), we
 * say so explicitly ("no wheels fit your <vehicle>") rather than the generic
 * filter copy, and the recovery action turns fitment OFF (fit=0) — bare /store
 * would just get the active vehicle's fit re-applied by FitmentSync.
 */
const DiscoveryEmpty = () => {
  const { clearAll } = useDiscoveryQuery()
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
  // explicit opt-out FitmentSync never overrides.
  const turnOffFit = () => {
    const n = new URLSearchParams(Array.from(sp.entries()))
    n.set("fit", "0")
    n.delete("page")
    router.replace(`${pathname}?${n.toString()}`)
  }

  if (fitActive) {
    const who = vehicleLabel ? `your ${vehicleLabel}` : "this vehicle"
    return (
      <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
        <div style={{ opacity: 0.4 }}>
          <Wheel size={140} finish="black" />
        </div>
        <Label tone="muted">NO FITTING WHEELS</Label>
        <Display size={28} as="h2">
          No wheels in our catalog fit {who} yet.
        </Display>
        <p className="text-[14px] text-[var(--graphite)] max-w-[420px]">
          Nothing in stock matches this vehicle&apos;s bolt pattern
          {fit ? ` (${fit})` : ""} right now. Turn off the vehicle filter to
          browse the full catalog.
        </p>
        <Button onClick={turnOffFit} className="mt-2">
          See all wheels
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
      <div style={{ opacity: 0.4 }}>
        <Wheel size={140} finish="black" />
      </div>
      <Label tone="muted">NO MATCHES</Label>
      <Display size={28} as="h2">
        No wheels match these filters.
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[400px]">
        Try widening your selection — maybe drop the diameter or finish
        constraint, or clear everything and start over.
      </p>
      <Button onClick={clearAll} className="mt-2">
        Clear all filters
      </Button>
    </div>
  )
}

export default DiscoveryEmpty
