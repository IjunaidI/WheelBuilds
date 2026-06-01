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

    if (!desired && fit) { replace(null); return }            // case 2: no active vehicle → strip
    if (desired && fit !== desired) { replace(desired); return } // case 1 & 3: set / replace stale

    function replace(value: string | null) {
      const next = new URLSearchParams(Array.from(sp.entries()))
      if (value) next.set("fit", value); else next.delete("fit")
      next.delete("page") // reset pagination on filter change (mirrors useDiscoveryQuery)
      router.replace(`${pathname}?${next.toString()}`)
    }
  }, [active?.id, active?.canonicalBoltPatterns?.join(","), sp, pathname, router])

  return null
}
