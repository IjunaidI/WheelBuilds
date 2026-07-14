"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { TireProductDetail, TireSizeOption } from "../../../data/types"
import { sizesForRim, pickDefaultTireSize } from "../../../data/tire/tire-size-options"
import { headlinePriceCents } from "../../../data/price-truth"
import { useGarage } from "@lib/garage/use-garage"
import { tireFitsVehicle } from "@lib/fitment/tire-fits-vehicle"
import { setSelectedTireFit } from "@lib/stores/selected-tire-fit"
import FitBanner from "@modules/product-detail/components/hero/fit-banner"
import TireGallery from "./gallery"
import TireSizePicker from "./size-picker"
import TirePurchasePanel from "./purchase-panel"

type TireHeroProps = {
  product: TireProductDetail
}

/**
 * Tire PDP hero. Mirrors the wheel hero's fit behavior on the single Size axis
 * (rim diameter gates a size list): when a garage vehicle with OEM tire sizes is
 * active, the picker shows ONLY the sizes that fit it, with a `FitBanner`
 * "Show all" escape — exactly like the wheel hero's `buildFitView` fit-mode
 * (WB-060), minus the finish/bolt/offset/bore/load axes tires don't have.
 *
 * Layout: small+ = 2-col split (Gallery left, brand/name/price + picker +
 * purchase panel right); mobile = stacked.
 */
const TireHero = ({ product }: TireHeroProps) => {
  const { active } = useGarage()

  // The active vehicle's OEM tires (size + load + speed) + the subset of this
  // product's size options that fit them. `canFilter` is true when we can
  // filter; when the car fits NONE of this tire's sizes we never filter to
  // empty — we show everything and the purchase chip reads "MAY NOT FIT"
  // (same honesty as the wheel hero's hasFit:false).
  const oemTires = active?.oemTires ?? []
  const oemKey = oemTires.map((t) => `${t.size}|${t.loadIndex ?? ""}|${t.speedRating ?? ""}`).join(",")
  const fittingSizeOptions = useMemo(
    () =>
      oemTires.length
        ? product.sizeOptions.filter((o) =>
            tireFitsVehicle(
              [{ size: o.canonicalSize, loadIndex: o.loadIndex ?? null, speedRating: o.speedRating ?? null }],
              oemTires
            )
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product.sizeOptions, oemKey]
  )
  const canFilter = fittingSizeOptions.length > 0

  const [showAll, setShowAll] = useState(false)
  const filtered = canFilter && !showAll
  const visibleSizeOptions = filtered ? fittingSizeOptions : product.sizeOptions
  const visibleRims = useMemo(
    () => Array.from(new Set(visibleSizeOptions.map((o) => o.rimDiameterIn))).sort((a, b) => a - b),
    [visibleSizeOptions]
  )

  // A new active vehicle re-filters from scratch (drop a prior "Show all").
  const activeId = active?.id ?? null
  useEffect(() => {
    setShowAll(false)
  }, [activeId])

  const defaultSize = useMemo<TireSizeOption | undefined>(
    () => pickDefaultTireSize(product.sizeOptions),
    [product.sizeOptions]
  )

  const [selectedRim, setSelectedRim] = useState<number>(
    defaultSize?.rimDiameterIn ?? product.rimDiameters[0] ?? 0
  )
  const [selectedSizeLabel, setSelectedSizeLabel] = useState<string>(
    defaultSize?.sizeLabel ?? ""
  )

  // Fit-aware default (WB-063 T7): once a vehicle with OEM tire sizes is active,
  // snap once to the first fitting size. Guarded so it applies at most once per
  // mount and never clobbers a manual pick.
  const appliedFitDefaultRef = useRef(false)
  const userInteractedRef = useRef(false)
  useEffect(() => {
    if (appliedFitDefaultRef.current || userInteractedRef.current) return
    const fitting = fittingSizeOptions[0]
    if (fitting) {
      appliedFitDefaultRef.current = true
      setSelectedRim(fitting.rimDiameterIn)
      setSelectedSizeLabel(fitting.sizeLabel)
    }
  }, [fittingSizeOptions])

  const sizesForSelectedRim = useMemo(
    () => sizesForRim(visibleSizeOptions, selectedRim),
    [visibleSizeOptions, selectedRim]
  )

  const selectedSize = useMemo<TireSizeOption | undefined>(
    () =>
      visibleSizeOptions.find((s) => s.sizeLabel === selectedSizeLabel) ??
      pickDefaultTireSize(sizesForSelectedRim),
    [visibleSizeOptions, selectedSizeLabel, sizesForSelectedRim]
  )

  // Publish the selected size's fit spec so the fitment section further down the
  // page (a sibling component) can keep its "Does it fit your ride?" band honest
  // per selection — same per-selection honesty as the purchase-panel chip. Reset
  // to null on unmount so the next tire PDP doesn't inherit a stale selection.
  useEffect(() => {
    setSelectedTireFit(
      selectedSize
        ? {
            size: selectedSize.canonicalSize,
            loadIndex: selectedSize.loadIndex ?? null,
            speedRating: selectedSize.speedRating ?? null,
          }
        : null
    )
  }, [selectedSize])
  useEffect(() => () => setSelectedTireFit(null), [])

  // Keep the selection inside the visible set — the rim must be a visible rim and
  // the size must belong to it. Runs when the visible set (fit filter toggled) or
  // the rim changes; `selectedSizeLabel` is intentionally omitted so a manual size
  // pick is never re-snapped.
  useEffect(() => {
    if (visibleRims.length && !visibleRims.includes(selectedRim)) {
      setSelectedRim(visibleRims[0])
      return
    }
    const stillValid = sizesForSelectedRim.some((s) => s.sizeLabel === selectedSizeLabel)
    if (!stillValid) {
      setSelectedSizeLabel(pickDefaultTireSize(sizesForSelectedRim)?.sizeLabel ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRims, selectedRim, sizesForSelectedRim])

  const handleRimChange = (rim: number) => {
    userInteractedRef.current = true
    setSelectedRim(rim)
  }
  const handleSizeChange = (label: string) => {
    userInteractedRef.current = true
    setSelectedSizeLabel(label)
  }

  // The selected size's OWN price ONLY (WB-090 P12) — dropping the
  // `?? product.priceCents` fallback, which was the product-wide min-price
  // across all sizes (see map-tire-detail.ts) and could silently show a
  // DIFFERENT price than this exact size actually charges. `null` means no
  // live price for this size right now; the purchase panel renders "Price
  // unavailable" and disables purchase instead of a misleading $0.00.
  const unitPriceCents = headlinePriceCents(selectedSize?.priceCents)
  const vehicleLabel = active
    ? `${active.year} ${active.make} ${active.model}${active.trim ? ` ${active.trim}` : ""}`
    : ""

  return (
    <section className="grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-start">
      <TireGallery product={product} />
      <div className="flex flex-col gap-8">
        {canFilter && (
          <FitBanner
            filtered={filtered}
            vehicleLabel={vehicleLabel}
            onShowAll={() => setShowAll(true)}
            onOnlyFit={() => setShowAll(false)}
          />
        )}
        <TirePurchasePanel
          product={product}
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
        />
        <TireSizePicker
          rimDiameters={visibleRims}
          selectedRim={selectedRim}
          onRimChange={handleRimChange}
          sizes={sizesForSelectedRim}
          selectedSize={selectedSize}
          onSizeChange={handleSizeChange}
        />
      </div>
    </section>
  )
}

export default TireHero
