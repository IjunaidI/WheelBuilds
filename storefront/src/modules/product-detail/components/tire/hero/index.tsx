"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import { TireProductDetail, TireSizeOption } from "../../../data/types"
import { sizesForRim, pickDefaultTireSize } from "../../../data/tire/tire-size-options"
import { useGarage } from "@lib/garage/use-garage"
import { tireFitsVehicle } from "@lib/fitment/tire-fits-vehicle"
import TireGallery from "./gallery"
import TireSizePicker from "./size-picker"
import TirePurchasePanel from "./purchase-panel"

type TireHeroProps = {
  product: TireProductDetail
}

/**
 * Tire PDP hero. A SIMPLIFIED mirror of the wheel hero — owns a single Size
 * axis (rim diameter gates a size list) instead of finish / bolt-pattern /
 * offset / bore / load. Kept client so the picks are interactive without page
 * reloads, same as the wheel hero.
 *
 * WB-063 T7: reads the active garage vehicle directly (no `?fit=1` — unlike
 * the wheel hero's fit-mode flow, tires don't gate/filter the size list, they
 * just prefer a fitting size as the initial pick) to (a) compute
 * `productSizes` for the purchase panel's fit chip and (b) auto-snap the
 * default rim/size once to the first OEM-matching size.
 *
 * Layout: small+ = 2-col split (Gallery left, brand/name/price + picker +
 * purchase panel right); mobile = stacked.
 */
const TireHero = ({ product }: TireHeroProps) => {
  const rimDiameters = product.rimDiameters
  const { active } = useGarage()

  // Canonical sizes this product is offered in — the fit chip in the purchase
  // panel intersects this against the active vehicle's OEM sizes.
  const productSizes = useMemo(
    () => product.sizeOptions.map((o) => o.canonicalSize),
    [product.sizeOptions]
  )

  const defaultSize = useMemo<TireSizeOption | undefined>(
    () => pickDefaultTireSize(product.sizeOptions),
    [product.sizeOptions]
  )

  const [selectedRim, setSelectedRim] = useState<number>(
    defaultSize?.rimDiameterIn ?? rimDiameters[0] ?? 0
  )
  const [selectedSizeLabel, setSelectedSizeLabel] = useState<string>(
    defaultSize?.sizeLabel ?? ""
  )

  // Fit-aware default (WB-063 T7, WB-060 analog): once a vehicle with OEM tire
  // sizes is active, snap to the first size that matches it. `useState`'s
  // initializer above only runs once at mount, and the garage's snapshot can
  // still be null then (SSR hydration, or the async fitment lookup noted in
  // use-garage.ts resolving after mount) — so this effect re-fires whenever
  // `active` changes and applies the fitting default the moment one becomes
  // available. Guarded by two refs so it only ever applies ONCE per mount and
  // never clobbers a size the shopper has already picked by hand.
  const appliedFitDefaultRef = useRef(false)
  const userInteractedRef = useRef(false)
  useEffect(() => {
    if (appliedFitDefaultRef.current || userInteractedRef.current) return
    const oemSizes = active?.oemTireSizes
    if (!oemSizes?.length) return
    const fitting = product.sizeOptions.find((o) =>
      tireFitsVehicle([o.canonicalSize], oemSizes)
    )
    if (fitting) {
      appliedFitDefaultRef.current = true
      setSelectedRim(fitting.rimDiameterIn)
      setSelectedSizeLabel(fitting.sizeLabel)
    }
  }, [active, product.sizeOptions])

  const sizesForSelectedRim = useMemo(
    () => sizesForRim(product.sizeOptions, selectedRim),
    [product.sizeOptions, selectedRim]
  )

  const selectedSize = useMemo<TireSizeOption | undefined>(
    () =>
      product.sizeOptions.find((s) => s.sizeLabel === selectedSizeLabel) ??
      pickDefaultTireSize(sizesForSelectedRim),
    [product.sizeOptions, selectedSizeLabel, sizesForSelectedRim]
  )

  // Re-snap the size when the rim changes so selectedSizeLabel always points
  // at a size that belongs to the currently selected rim.
  useEffect(() => {
    const stillValid = sizesForSelectedRim.some(
      (s) => s.sizeLabel === selectedSizeLabel
    )
    if (!stillValid) {
      setSelectedSizeLabel(pickDefaultTireSize(sizesForSelectedRim)?.sizeLabel ?? "")
    }
    // selectedSizeLabel intentionally omitted: re-snap only when the rim changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRim, sizesForSelectedRim])

  // Mark manual interaction so the one-shot fit-aware default effect above
  // never overrides a pick the shopper made themselves.
  const handleRimChange = (rim: number) => {
    userInteractedRef.current = true
    setSelectedRim(rim)
  }
  const handleSizeChange = (label: string) => {
    userInteractedRef.current = true
    setSelectedSizeLabel(label)
  }

  // selectedSize.variantId drives the cart line item — read directly by
  // TirePurchasePanel, not threaded through as a separate prop here.
  const unitPriceCents = selectedSize?.priceCents ?? product.priceCents

  return (
    <section className="grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-start">
      <TireGallery product={product} />
      <div className="flex flex-col gap-8">
        <div>
          <Label style={{ display: "block", marginBottom: 12 }}>
            {product.brand}
          </Label>
          <Display size={36} as="h1" className="small:!text-[56px]">
            {product.name}
          </Display>
          <div className="flex items-baseline gap-3 mt-5">
            <Display size={40} as="div">
              <span style={{ color: "var(--orange)" }}>$</span>
              {Math.round(unitPriceCents / 100).toLocaleString()}
            </Display>
            <Label tone="muted">PER TIRE</Label>
          </div>
        </div>
        <TireSizePicker
          rimDiameters={rimDiameters}
          selectedRim={selectedRim}
          onRimChange={handleRimChange}
          sizes={sizesForSelectedRim}
          selectedSize={selectedSize}
          onSizeChange={handleSizeChange}
        />
        <TirePurchasePanel
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
          productSizes={productSizes}
        />
      </div>
    </section>
  )
}

export default TireHero
