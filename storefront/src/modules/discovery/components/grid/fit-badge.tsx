"use client"

import { useGarage } from "@lib/garage/use-garage"
import Chip from "@modules/common/components/chip"
import { productFitsVehicle } from "@lib/fitment/product-fits"

/**
 * Renders the FITS chip on a discovery card when the active garage vehicle's
 * bolt patterns intersect the product's. Client-only because the active
 * vehicle lives in the garage store; the card itself stays a server component.
 *
 * Gated on `fit` (fit-mode listings only, WB-072 S6): `DiscoveryProduct` only
 * carries aggregated, product-level fields (e.g. `boltPatternsCanonical`), not
 * per-variant metadata, so this bolt-pattern-only intersection can't tell
 * whether the MATCHING pattern is actually offered in a size that fits the
 * vehicle. In fit mode the listing is already post-filtered upstream by the
 * rigorous per-variant `productHasFittingVariant` (see
 * discovery/data/get-products.ts), so every card shown there has a genuinely
 * fitting variant and the badge is truthful. Outside fit mode (plain browse,
 * the PDP "Similar wheels" row, the home "NEW THIS WEEK" rail) that per-variant
 * guarantee doesn't hold, so the badge is dropped rather than over-claiming.
 */
export default function FitBadge({ patterns, fit }: { patterns: string[]; fit?: boolean }) {
  const { active } = useGarage()
  if (!fit || !active || !productFitsVehicle(patterns, active.canonicalBoltPatterns)) return null
  return (
    <div className="absolute top-2.5 right-2.5">
      <Chip variant="accent" size="sm" dot>
        FITS
      </Chip>
    </div>
  )
}
