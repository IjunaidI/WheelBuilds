"use client"

import { useEffect, useMemo, useState } from "react"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import { TireProductDetail, TireSizeOption } from "../../../data/types"
import { sizesForRim, pickDefaultTireSize } from "../../../data/tire/tire-size-options"
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
 * Layout: small+ = 2-col split (Gallery left, brand/name/price + picker +
 * purchase panel right); mobile = stacked.
 */
const TireHero = ({ product }: TireHeroProps) => {
  const rimDiameters = product.rimDiameters

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
          onRimChange={setSelectedRim}
          sizes={sizesForSelectedRim}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSizeLabel}
        />
        <TirePurchasePanel
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
        />
      </div>
    </section>
  )
}

export default TireHero
