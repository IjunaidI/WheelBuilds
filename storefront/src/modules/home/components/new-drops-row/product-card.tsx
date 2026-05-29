"use client"

import { MouseEvent } from "react"
import { toast } from "sonner"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Icon from "@modules/common/components/icon"
import Wheel, { Finish } from "@modules/common/components/wheel"
import Label from "@modules/common/components/label"
import Display from "@modules/common/components/display"
import Chip from "@modules/common/components/chip"

export type ProductCardProps = {
  name: string
  brand: string
  price: string
  isNew?: boolean
  finish?: Finish
  swatches?: string[]
  fits?: boolean
  compact?: boolean
  /** Optional product handle. Defaults to a slug of `name`. Routes to /products/<handle>. */
  handle?: string
}

const DEFAULT_SWATCHES = ["#0F0F10", "#8a5a30", "#c8c8cc", "#3A3A3D"]

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const ProductCard = ({
  name,
  brand,
  price,
  isNew,
  finish = "black",
  swatches = DEFAULT_SWATCHES,
  fits,
  compact,
  handle,
}: ProductCardProps) => {
  const productHandle = handle ?? slugify(name)

  const handleWishlist = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toast(`Saved ${name}`, {
      description: "Find it in your account later.",
    })
  }

  return (
    <LocalizedClientLink
      href={`/products/${productHandle}`}
      className="product-card block no-underline text-inherit"
      style={{ padding: compact ? 16 : 20 }}
      aria-label={`${brand} ${name}`}
    >
      {isNew && (
        <span style={{ position: "absolute", top: 16, left: 16, zIndex: 2 }}>
          <Chip variant="accent" size="sm">
            NEW
          </Chip>
        </span>
      )}
      <button
        type="button"
        onClick={handleWishlist}
        aria-label={`Save ${name} to wishlist`}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 2,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ink)",
          padding: 0,
        }}
      >
        <Icon name="heart" size={18} />
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: compact ? 180 : 220,
          padding: "12px 0",
          position: "relative",
        }}
      >
        <Wheel size={compact ? 160 : 200} finish={finish} />
      </div>
      <Label tone="muted" style={{ fontSize: 10, marginBottom: 6, display: "block" }}>
        {brand}
      </Label>
      <Display size={compact ? 17 : 19} as="div" style={{ lineHeight: 1.1 }}>
        {name}
      </Display>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {swatches.map((s, i) => (
          <span key={i} className="swatch-dot" style={{ background: s }} />
        ))}
        <Label
          tone="muted"
          style={{
            fontSize: 10,
            marginLeft: 4,
            alignSelf: "center",
            display: "inline-block",
          }}
        >
          +2
        </Label>
      </div>
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Label tone="muted" style={{ fontSize: 10 }}>
          FROM
        </Label>
        <Display size={18} as="span">
          <span style={{ color: "var(--orange)" }}>$</span>
          {price}
        </Display>
      </div>
      {fits && (
        <div style={{ marginTop: 10 }}>
          <Chip variant="accent" size="sm" dot>
            FITS YOUR F-150
          </Chip>
        </div>
      )}
    </LocalizedClientLink>
  )
}

export default ProductCard
