"use client"

import { useGarage } from "@lib/garage/use-garage"
import Chip from "@modules/common/components/chip"
import { tireFitsVehicle } from "@lib/fitment/tire-fits-vehicle"

/**
 * Renders the FITS chip on a tire discovery card when the active garage
 * vehicle's OEM tire sizes intersect the product's canonical sizes.
 * Client-only because the active vehicle lives in the garage store; the card
 * itself stays a server component. Mirrors the wheel discovery FitBadge
 * (modules/discovery/components/grid/fit-badge.tsx).
 */
export default function TireFitBadge({ sizes }: { sizes: string[] }) {
  const { active } = useGarage()
  if (!active?.oemTireSizes?.length || !tireFitsVehicle(sizes, active.oemTireSizes)) return null
  return (
    <div className="absolute top-11 right-2.5">
      <Chip variant="accent" size="sm" dot>
        FITS
      </Chip>
    </div>
  )
}
