// storefront/src/modules/discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { patternsToFitParam } from "@modules/discovery/data/vehicle-constraint"

export default function FitmentSync() {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    const fit = sp.get("fit")
    if (fit === "0") return // explicit opt-out is authoritative — never overwrite

    const activePatterns = active?.canonicalBoltPatterns ?? []
    const desired = activePatterns.length ? patternsToFitParam(activePatterns) : null

    // Sync ?fit TO the active vehicle's bolt patterns, but never auto-STRIP a
    // fit that is already in the URL. The garage loads asynchronously (and, when
    // signed in, RoutingGarage swaps the local provider for the remote one ~1s
    // after boot), so the active vehicle's patterns are routinely unavailable
    // for a beat — and permanently for a vehicle wheel-size has no data on.
    // Stripping in that window yanked the user off a valid fitment result
    // (including the "no wheels fit this vehicle" empty state) ~1s after load,
    // which read as "it filtered, then bounced back to the full catalog."
    // Clearing fitment is an explicit user action: the "Fits: …" chip sets fit=0.
    if (desired && fit !== desired) { replace(desired); return } // set / replace stale

    function replace(value: string | null) {
      const next = new URLSearchParams(Array.from(sp.entries()))
      if (value) next.set("fit", value); else next.delete("fit")
      next.delete("page") // reset pagination on filter change (mirrors useDiscoveryQuery)
      router.replace(`${pathname}?${next.toString()}`)
    }
  }, [active?.id, active?.canonicalBoltPatterns?.join(","), sp, pathname, router])

  return null
}
