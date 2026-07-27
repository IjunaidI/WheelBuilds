// storefront/src/modules/discovery/components/fitment-sync/index.tsx
"use client"
import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → the window-param refinement shows the top progress bar
import { useGarage } from "@lib/garage/use-garage"
import { patternsToFitParam, winToParam } from "@modules/discovery/data/vehicle-constraint"
import { FIT_PARAM_KEYS, shouldStripFit } from "./strip-fit"

export default function FitmentSync() {
  const { active, isLoaded } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    const isExplicitOptOut = sp.get("fit") === "0"
    if (isExplicitOptOut) return // explicit opt-out is authoritative — never overwrite

    const activePatterns = active?.canonicalBoltPatterns ?? []
    const desiredFit = activePatterns.length ? patternsToFitParam(activePatterns) : null

    // Never auto-STRIP a fit already in the URL just because desiredFit is
    // momentarily null: the garage loads asynchronously (and RoutingGarage
    // swaps local→remote ~1s after boot), so the active vehicle's data is
    // routinely unavailable for a beat on ordinary page load. shouldStripFit
    // (WB-073 Task 9 / G10) only allows a strip once `isLoaded` is genuinely
    // true, so a real in-flight load can never flicker the URL clean. Once
    // loaded-and-empty is real — no active vehicle (deleted, e.g. the last
    // vehicle removed) OR an active vehicle wheel-size has no bolt-pattern
    // data for — an orphaned fit param can never be satisfied and gets
    // cleared. Clearing fitment is otherwise an explicit user action (the
    // "Fits: …" chip sets fit=0, handled above).
    if (!desiredFit) {
      const hasFitParam = FIT_PARAM_KEYS.some((k) => sp.has(k))
      // `undefined` = the wheel-size lookup for this vehicle hasn't landed
      // yet (mid-YMM-submit); `[]` = it landed and found nothing. Only the
      // latter is an orphaned param worth stripping — see fitmentPending.
      const fitmentPending =
        !!active && active.canonicalBoltPatterns === undefined
      if (
        shouldStripFit({
          isLoaded,
          hasActive: false,
          hasFitParam,
          isExplicitOptOut,
          fitmentPending,
        })
      ) {
        const next = new URLSearchParams(Array.from(sp.entries()))
        for (const k of FIT_PARAM_KEYS) next.delete(k)
        next.delete("page") // reset pagination on filter change (mirrors useDiscoveryQuery)
        router.replace(`${pathname}?${next.toString()}`)
      }
      return
    }

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
    isLoaded,
    sp,
    pathname,
    router,
  ])

  return null
}
