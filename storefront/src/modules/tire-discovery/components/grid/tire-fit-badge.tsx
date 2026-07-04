"use client"

import { useGarage } from "@lib/garage/use-garage"
import Chip from "@modules/common/components/chip"
import { tireFitsVehicle, TireFitSpec } from "@lib/fitment/tire-fits-vehicle"

/**
 * Renders the FITS chip on a tire discovery card when the active garage
 * vehicle's OEM tires (size + load + speed) intersect one of the product's
 * per-variant fit specs. Client-only because the active vehicle lives in the
 * garage store; the card itself stays a server component. Mirrors the wheel
 * discovery FitBadge (modules/discovery/components/grid/fit-badge.tsx).
 */
export default function TireFitBadge({ fitSpecs }: { fitSpecs: TireFitSpec[] }) {
  const { active } = useGarage()
  if (!active?.oemTires?.length || !tireFitsVehicle(fitSpecs, active.oemTires)) return null
  return (
    <div className="absolute top-2.5 right-2.5">
      <Chip variant="accent" size="sm" dot>
        FITS
      </Chip>
    </div>
  )
}
