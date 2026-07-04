// storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the window-param refinement shows the top progress bar
import { useGarage } from "@lib/garage/use-garage"
import { oemTiresToFitParams } from "../../data/types"

/**
 * Tire-discovery counterpart to `modules/discovery/components/fitment-sync`
 * (the wheel `FitmentSync`). Mirrors its guards verbatim; the only transform
 * is the param set + source: tires sync `fit`+`fitl`+`fits` (size + load +
 * speed, WB-068 — was `fit`-only, sizes) — no `fitb/fitd/fitw/fito` (those
 * windows are wheel-only concepts) — sourced from the active vehicle's
 * `oemTires` via `oemTiresToFitParams` instead of the wheel's
 * `canonicalBoltPatterns` via `patternsToFitParam`/`winToParam`.
 */
export default function TireFitmentSync() {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    if (sp.get("fit") === "0") return // explicit opt-out is authoritative — never overwrite

    const desired = oemTiresToFitParams(active?.oemTires ?? [])

    // Never auto-STRIP a fit already in the URL: the garage loads asynchronously
    // (and RoutingGarage swaps local→remote ~1s after boot), so the active
    // vehicle's data is routinely unavailable for a beat — and permanently for
    // a vehicle wheel-size has no OEM tire data for. Only ACT once we have the
    // vehicle's sizes; clearing fitment is an explicit user action (the
    // "Fits: …" chip sets fit=0).
    if (!desired.fit) return

    // Tires sync `fit`+`fitl`+`fits` — no size-window params to thread
    // through (unlike wheels, which also sync bore/diameter/width/offset).
    const inSync = (Object.keys(desired) as (keyof typeof desired)[]).every(
      (k) => (sp.get(k) ?? "") === desired[k]
    )
    if (inSync) return

    const next = new URLSearchParams(Array.from(sp.entries()))
    for (const [k, v] of Object.entries(desired)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    next.delete("page") // reset pagination on filter change (mirrors useTireQuery)
    router.replace(`${pathname}?${next.toString()}`)
  }, [
    active?.id,
    JSON.stringify(active?.oemTires ?? []),
    sp,
    pathname,
    router,
  ])

  return null
}
