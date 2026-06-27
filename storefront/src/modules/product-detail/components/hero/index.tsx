"use client"

import { useEffect, useMemo, useState } from "react"
import { OffsetVariant, ProductDetail, SizeOption } from "../../data/types"
import { sizesForBoltPattern, pickDefaultSize, boresFor, loadsForBore, resolveLeafVariant } from "../../data/group-sizes"
import Gallery from "./gallery"
import VariantPicker from "./variant-picker"
import PurchasePanel from "./purchase-panel"
import AutoFitmentCard from "./auto-fitment-card"
import AdvancedFitmentPanel from "./advanced-fitment-panel"
import SpecSelector from "./spec-selector"

type HeroProps = {
  product: ProductDetail
}

/**
 * The PDP hero. Owns the variant-selection state (finish / size / bolt
 * pattern / offset) and threads it down to Gallery, PurchasePanel, and the
 * fitment cards. Kept client so the picks are interactive without page reloads.
 *
 * Fitment flow: size matrix → AutoFitmentCard (auto-set to OEM offset, switches
 * to "Custom override" if the user touches the Advanced disclosure) →
 * AdvancedFitmentPanel (the only way to override — collapsed by default).
 * Stance pickers are deliberately gone; OEM auto-fit covers the default case
 * and pros get the raw ET chips one click away.
 *
 * Layout:
 *   small+: 2-col split — Gallery left, purchase+picker right
 *   mobile: stacked — Gallery first, then purchase+picker
 */
const Hero = ({ product }: HeroProps) => {
  const finishOptions = product.finishOptions
  const [activeFinishRaw, setActiveFinishRaw] = useState<string>(
    finishOptions[0]?.raw ?? "—"
  )
  const activeFinish = useMemo(
    () => finishOptions.find((f) => f.raw === activeFinishRaw) ?? finishOptions[0],
    [finishOptions, activeFinishRaw]
  )
  const finishSizeOptions = activeFinish?.sizeOptions ?? product.sizeOptions

  const [selectedBoltPattern, setSelectedBoltPattern] = useState<string>(
    product.boltPatternOptions[0] ?? product.boltPattern
  )

  // Bolt pattern gates the grid: only the selected pattern's sizes are shown.
  const visibleSizes = useMemo<SizeOption[]>(
    () => sizesForBoltPattern(finishSizeOptions, selectedBoltPattern),
    [finishSizeOptions, selectedBoltPattern]
  )

  // Default to the first in-stock size in the visible (pattern-scoped) set.
  const defaultSize = useMemo<SizeOption>(
    () => pickDefaultSize(visibleSizes),
    [visibleSizes]
  )
  const [selectedSize, setSelectedSize] = useState<SizeOption>(defaultSize)

  // When the bolt pattern changes, the previously-selected size belongs to the
  // old pattern and is no longer in visibleSizes — re-snap to a valid size.
  // visibleSizes is filtered from product.sizeOptions, so element references are
  // preserved and includes() is a reliable membership check.
  useEffect(() => {
    if (!visibleSizes.includes(selectedSize)) {
      setSelectedSize(pickDefaultSize(visibleSizes))
    }
    // selectedSize intentionally omitted: re-snap only when the pattern changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSizes])

  const oemOffsetMm = selectedSize.oemOffsetMm ?? selectedSize.offsetMm
  const [selectedOffsetMm, setSelectedOffsetMm] = useState<number>(oemOffsetMm)

  // When the size changes, snap the offset back to the new size's OEM pick.
  useEffect(() => {
    setSelectedOffsetMm(oemOffsetMm)
  }, [selectedSize, oemOffsetMm])

  const isOem = selectedOffsetMm === oemOffsetMm

  const offsetVariants = useMemo<OffsetVariant[]>(
    () => selectedSize.offsetVariants ?? [],
    [selectedSize]
  )

  const [selectedBore, setSelectedBore] = useState<number | null>(null)
  const [selectedLoad, setSelectedLoad] = useState<number | null>(null)

  // Progressive disclosure: bore branches at the offset level; load CASCADES
  // off the selected bore so an invalid (bore, load) pair is never offered.
  const availableBores = useMemo(
    () => boresFor(offsetVariants, selectedOffsetMm),
    [offsetVariants, selectedOffsetMm]
  )
  const availableLoads = useMemo(
    () => loadsForBore(offsetVariants, selectedOffsetMm, selectedBore),
    [offsetVariants, selectedOffsetMm, selectedBore]
  )

  // Snap bore to the best-availability leaf whenever (size, offset) changes.
  useEffect(() => {
    setSelectedBore(
      resolveLeafVariant(selectedSize, selectedOffsetMm)?.centerBoreMm ?? null
    )
  }, [selectedSize, selectedOffsetMm])

  // Snap load to a valid value for the current (size, offset, bore); cascades
  // when bore changes so the selection always points at a real variant.
  useEffect(() => {
    setSelectedLoad(
      resolveLeafVariant(selectedSize, selectedOffsetMm, selectedBore)
        ?.loadRatingLb ?? null
    )
  }, [selectedSize, selectedOffsetMm, selectedBore])

  // Fallback chain: never leave currentOffset null when the (size, offset) has
  // any variant — drop the load constraint, then the bore constraint, in turn.
  const currentOffset =
    resolveLeafVariant(selectedSize, selectedOffsetMm, selectedBore, selectedLoad) ??
    resolveLeafVariant(selectedSize, selectedOffsetMm, selectedBore) ??
    resolveLeafVariant(selectedSize, selectedOffsetMm)

  // Price the *selected* offset, not the size's cheapest — multi-offset sizes
  // can carry different MSRPs. Falls back to the size "from" price, then product.
  const unitPriceCents =
    currentOffset?.priceCents ??
    selectedSize.priceCentsOverride ??
    product.priceCents

  return (
    <section className="grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-start">
      <Gallery
        finishes={finishOptions}
        activeFinishRaw={activeFinishRaw}
        onFinishChange={setActiveFinishRaw}
      />
      <div className="flex flex-col gap-8">
        <PurchasePanel
          product={product}
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
          selectedVariant={currentOffset}
        />
        <VariantPicker
          sizes={visibleSizes}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSize}
          boltPatterns={product.boltPatternOptions}
          selectedBoltPattern={selectedBoltPattern}
          onBoltPatternChange={setSelectedBoltPattern}
        />
        {availableBores.length > 1 && (
          <SpecSelector
            label="Center bore"
            values={availableBores}
            selected={selectedBore}
            onSelect={setSelectedBore}
            unit="mm"
          />
        )}
        {availableLoads.length > 1 && (
          <SpecSelector
            label="Load rating"
            values={availableLoads}
            selected={selectedLoad}
            onSelect={setSelectedLoad}
            unit="lb"
          />
        )}
        <AutoFitmentCard
          sizeLabel={`${selectedSize.diameter}×${selectedSize.width}`}
          offsetMm={selectedOffsetMm}
          backspaceIn={currentOffset?.backspaceIn}
          isOem={isOem}
          onResetToOem={() => setSelectedOffsetMm(oemOffsetMm)}
        />
        {offsetVariants.length > 1 && (
          <AdvancedFitmentPanel
            sizeLabel={`${selectedSize.diameter}×${selectedSize.width}`}
            offsetVariants={offsetVariants}
            selectedOffsetMm={selectedOffsetMm}
            oemOffsetMm={oemOffsetMm}
            onSelectOffset={setSelectedOffsetMm}
          />
        )}
      </div>
    </section>
  )
}

export default Hero
