// storefront/src/modules/discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { patternsToFitParam, winToParam } from "@modules/discovery/data/vehicle-constraint"

export default function FitmentSync() {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    if (sp.get("fit") === "0") return // explicit opt-out is authoritative — never overwrite

    const activePatterns = active?.canonicalBoltPatterns ?? []
    const desiredFit = activePatterns.length ? patternsToFitParam(activePatterns) : null

    // Never auto-STRIP a fit already in the URL: the garage loads asynchronously
    // (and RoutingGarage swaps local→remote ~1s after boot), so the active
    // vehicle's data is routinely unavailable for a beat — and permanently for a
    // vehicle wheel-size has no data on. Only ACT once we have the vehicle's
    // patterns; clearing fitment is an explicit user action (the "Fits: …" chip
    // sets fit=0).
    if (!desiredFit) return

    // Sync the FULL fitment (bolt patterns + the size windows discovery needs to
    // match the PDP), not just ?fit. The window params must land even when ?fit
    // is already correct — e.g. the fitment button sets ?fit=5x100 directly, so
    // without this the size windows would never reach discovery and it would
    // only ever narrow by bolt pattern.
    const desired = {
      fit: desiredFit,
      fitb: active?.hubBoreMm != null ? String(active.hubBoreMm) : "",
      fitd: winToParam(active?.diameterWindow),
      fitw: winToParam(active?.widthWindow),
      fito: winToParam(active?.offsetWindow),
    }
    const inSync = (Object.keys(desired) as (keyof typeof desired)[]).every(
      (k) => (sp.get(k) ?? "") === desired[k]
    )
    if (inSync) return

    const next = new URLSearchParams(Array.from(sp.entries()))
    for (const [k, v] of Object.entries(desired)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete("page") // reset pagination on filter change (mirrors useDiscoveryQuery)
    router.replace(`${pathname}?${next.toString()}`)
  }, [
    active?.id,
    active?.canonicalBoltPatterns?.join(","),
    active?.hubBoreMm,
    JSON.stringify([active?.diameterWindow, active?.widthWindow, active?.offsetWindow]),
    sp,
    pathname,
    router,
  ])

  return null
}
