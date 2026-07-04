"use client"

import Image from "next/image"
import { TireProductDetail } from "../../../data/types"

type TireGalleryProps = {
  product: TireProductDetail
}

/**
 * Tire PDP hero image. Simpler than the wheel gallery — a single product
 * image, no finish switcher (tires don't carry a finish axis). Falls back to
 * the same neutral circular placeholder used by the tire discovery card
 * (`modules/tire-discovery/components/grid/tire-product-card.tsx`) when the
 * product has no thumbnail.
 */
const TireGallery = ({ product }: TireGalleryProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative aspect-square rounded-[var(--radius)] flex items-center justify-center overflow-hidden border border-[var(--hairline)]"
        style={{ background: "var(--soft)" }}
      >
        <div className="wheel-glow" style={{ position: "absolute", inset: 40, zIndex: 0 }} />
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={`${product.brand} ${product.name}`}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-8 z-10"
            priority
          />
        ) : (
          <div
            className="relative z-10 h-[60%] w-[60%] rounded-full border-[14px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

export default TireGallery
