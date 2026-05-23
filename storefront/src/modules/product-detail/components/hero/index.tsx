"use client"

import { useMemo, useState } from "react"
import { Finish } from "@modules/common/components/wheel"
import { ProductDetail, SizeOption } from "../../data/types"
import Gallery from "./gallery"
import VariantPicker from "./variant-picker"
import PurchasePanel from "./purchase-panel"

type HeroProps = {
  product: ProductDetail
}

/**
 * The PDP hero. Owns the variant-selection state (finish / size / bolt
 * pattern) and threads it down to Gallery and PurchasePanel. Kept client so
 * the picks are interactive without page reloads.
 *
 * Layout:
 *   small+: 2-col split — Gallery left, purchase+picker right
 *   mobile: stacked — Gallery first, then purchase+picker
 */
const Hero = ({ product }: HeroProps) => {
  const [activeFinish, setActiveFinish] = useState<Finish>(
    product.finishOptions[0] ?? product.finish
  )

  // Default to the first in-stock size (or just the first if all are out)
  const defaultSize = useMemo<SizeOption>(() => {
    return (
      product.sizeOptions.find((s) => s.availability !== "out_of_stock") ??
      product.sizeOptions[0]
    )
  }, [product.sizeOptions])
  const [selectedSize, setSelectedSize] = useState<SizeOption>(defaultSize)

  const [selectedBoltPattern, setSelectedBoltPattern] = useState<string>(
    product.boltPatternOptions[0] ?? product.boltPattern
  )

  const unitPriceCents =
    selectedSize.priceCentsOverride ?? product.priceCents

  return (
    <section className="grid grid-cols-1 small:grid-cols-2 gap-10 small:gap-16 items-start">
      <Gallery
        finishes={product.finishOptions}
        activeFinish={activeFinish}
        onFinishChange={setActiveFinish}
      />
      <div className="flex flex-col gap-8">
        <PurchasePanel
          product={product}
          selectedSize={selectedSize}
          unitPriceCents={unitPriceCents}
        />
        <VariantPicker
          sizes={product.sizeOptions}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSize}
          boltPatterns={product.boltPatternOptions}
          selectedBoltPattern={selectedBoltPattern}
          onBoltPatternChange={setSelectedBoltPattern}
        />
      </div>
    </section>
  )
}

export default Hero
