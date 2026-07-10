// storefront/src/modules/tire-discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the window-param refinement shows the top progress bar
import { useGarage } from "@lib/garage/use-garage"
import { oemTiresToFitParams } from "../../data/types"
import { shouldStripFit } from "@modules/discovery/components/fitment-sync/strip-fit"
import { TIRE_FIT_PARAM_KEYS } from "./tire-strip-fit"

/**
 * Tire-discovery counterpart to `modules/discovery/components/fitment-sync`
 * (the wheel `FitmentSync`). Mirrors its guards verbatim; the only transform
 * is the param set + source: tires sync `fit`+`fitl`+`fits` (size + load +
 * speed, WB-068 — was `fit`-only, sizes) — no `fitb/fitd/fitw/fito` (those
 * windows are wheel-only concepts) — sourced from the active vehicle's
 * `oemTires` via `oemTiresToFitParams` instead of the wheel's
 * `canonicalBoltPatterns` via `patternsToFitParam`/`winToParam`. It also
 * reuses the wheel twin's `shouldStripFit` (WB-079 B1) for the orphan-strip
 * decision — that helper is param-set-agnostic, so only the tire key tuple
 * (`TIRE_FIT_PARAM_KEYS`) differs.
 */
export default function TireFitmentSync() {
  const { active, isLoaded } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    const isExplicitOptOut = sp.get("fit") === "0"
    if (isExplicitOptOut) return // explicit opt-out is authoritative — never overwrite

    const desired = oemTiresToFitParams(active?.oemTires ?? [])

    if (!desired.fit) {
      const hasFitParam = TIRE_FIT_PARAM_KEYS.some((k) => sp.has(k))
      if (shouldStripFit({ isLoaded, hasActive: false, hasFitParam, isExplicitOptOut })) {
        const next = new URLSearchParams(Array.from(sp.entries()))
        for (const k of TIRE_FIT_PARAM_KEYS) next.delete(k)
        next.delete("page") // reset pagination on filter change (mirrors useTireQuery)
        router.replace(`${pathname}?${next.toString()}`)
      }
      return
    }

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
    isLoaded,
    sp,
    pathname,
    router,
  ])

  return null
}
