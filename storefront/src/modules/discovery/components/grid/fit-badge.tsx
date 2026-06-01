"use client"

import { useGarage } from "@lib/garage/use-garage"
import Chip from "@modules/common/components/chip"
import { productFitsVehicle } from "@lib/fitment/product-fits"

/**
 * Renders the FITS chip on a discovery card when the active garage vehicle's
 * bolt patterns intersect the product's. Client-only because the active
 * vehicle lives in the garage store; the card itself stays a server component.
 */
export default function FitBadge({ patterns }: { patterns: string[] }) {
  const { active } = useGarage()
  if (!active || !productFitsVehicle(patterns, active.canonicalBoltPatterns)) return null
  return (
    <div className="absolute top-2.5 right-2.5">
      <Chip variant="accent" size="sm" dot>
        FITS
      </Chip>
    </div>
  )
}
