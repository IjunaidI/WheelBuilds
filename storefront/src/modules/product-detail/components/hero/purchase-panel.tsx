"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { addToCart } from "@lib/data/cart"
import { OffsetVariant, ProductDetail, SizeOption } from "../../data/types"

type PurchasePanelProps = {
  product: ProductDetail
  selectedSize: SizeOption
  /**
   * Computed unit price for the current (size) variant in cents. Falls back
   * to `product.priceCents` when no override on the size.
   */
  unitPriceCents: number
  /** The exact Medusa variant resolved from size × offset; null if unresolved. */
  selectedVariant: OffsetVariant | null
}

const formatUsd = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString()}`

const PurchasePanel = ({
  product,
  selectedSize,
  unitPriceCents,
  selectedVariant,
}: PurchasePanelProps) => {
  const { active } = useGarage()
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [quantity, setQuantity] = useState(4) // wheels sell in sets of 4 by default
  const [buying, setBuying] = useState(false)

  const stepQty = (delta: number) =>
    setQuantity((q) => Math.max(1, Math.min(99, q + delta)))

  const canPurchase =
    !!selectedVariant && selectedVariant.availability !== "out_of_stock"

  const handleAddToCart = async () => {
    if (!selectedVariant) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      toast.success("Added to cart", {
        description: `${quantity} × ${product.name} (${selectedSize.diameter}×${selectedSize.width})`,
      })
    } catch {
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setBuying(false)
    }
  }

  const handleBuyNow = async () => {
    if (!selectedVariant) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      router.push(`/${countryCode}/checkout?step=address`)
      // Leave `buying` true through the navigation transition.
    } catch {
      toast.error("Couldn't start checkout", {
        description: "Please try again in a moment.",
      })
      setBuying(false)
    }
  }

  const handleSave = () => {
    // No wishlist backend yet (out of scope for WB-001). Keep the toast.
    toast(`Saved ${product.name}`, {
      description: "Find it in your account later.",
    })
  }

  return (
    <div className="flex flex-col">
      <Label style={{ display: "block", marginBottom: 12 }}>
        {product.brand}
      </Label>
      <Display size={36} as="h1" className="small:!text-[56px]">
        {product.name}
      </Display>

      {/* Price row */}
      <div className="flex items-baseline gap-3 mt-5">
        {product.originalPriceCents &&
          product.originalPriceCents > unitPriceCents && (
            <span className="text-[18px] font-[var(--mono)] text-[var(--ink-soft)] line-through">
              {formatUsd(product.originalPriceCents)}
            </span>
          )}
        <Display size={40} as="div">
          <span style={{ color: "var(--orange)" }}>$</span>
          {Math.round(unitPriceCents / 100).toLocaleString()}
        </Display>
        <Label tone="muted">PER WHEEL</Label>
      </div>

      <p
        style={{
          fontSize: 15,
          color: "var(--graphite)",
          margin: "20px 0 0",
          maxWidth: 520,
          lineHeight: 1.55,
        }}
      >
        {product.description}
      </p>

      {/* Fitment chip */}
      <div className="mt-5">
        {active ? (
          <Chip variant="accent" dot>
            CONFIRMED FIT · {active.year} {active.make.toUpperCase()}{" "}
            {active.model.toUpperCase()}
          </Chip>
        ) : (
          <Chip variant="outline" onClick={openSearch}>
            <Icon name="garage" size={12} strokeWidth={1.6} />
            Pick a vehicle to confirm fit
          </Chip>
        )}
      </div>

      <Separator className="my-6" />

      {/* Quantity + Add to cart + heart */}
      <div className="flex items-stretch gap-3">
        {/* Quantity stepper — replaces TextInput type="number" for a tidier feel */}
        <div className="inline-flex items-center border border-[var(--hairline)] rounded-[var(--radius)] h-14 bg-white">
          <button
            type="button"
            onClick={() => stepQty(-1)}
            aria-label="Decrease quantity"
            className="h-full w-12 flex items-center justify-center text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
          >
            <span className="text-[18px] leading-none">−</span>
          </button>
          <span
            className="h-full w-12 flex items-center justify-center border-x border-[var(--hairline)] font-[var(--display)] font-black text-[18px]"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => stepQty(1)}
            aria-label="Increase quantity"
            className="h-full w-12 flex items-center justify-center text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors"
          >
            <span className="text-[18px] leading-none">+</span>
          </button>
        </div>

        <Button
          onClick={handleAddToCart}
          disabled={!canPurchase || buying}
          className="flex-1"
          style={{ height: 56, fontSize: 14 }}
        >
          {!canPurchase
            ? "Out of stock"
            : `Add to cart · ${formatUsd(unitPriceCents * quantity)}`}
          {canPurchase && (
            <Icon name="arrow-right" size={16} color="white" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={handleSave}
          aria-label="Save to wishlist"
          style={{ height: 56, width: 56 }}
        >
          <Icon name="heart" size={18} />
        </Button>
      </div>

      {/* Buy now — skips the cart, jumps straight to checkout. Inverted ink
          treatment so it complements the orange Add-to-cart without competing
          for the primary slot. */}
      <Button
        onClick={handleBuyNow}
        disabled={!canPurchase || buying}
        className="mt-3 w-full bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
        style={{ height: 56, fontSize: 14 }}
      >
        Buy now · {formatUsd(unitPriceCents * quantity)}
        <Icon name="arrow-right" size={16} color="white" />
      </Button>

      {/* Trust strip — compressed for the purchase panel */}
      <div className="grid grid-cols-3 gap-4 pt-6 mt-2">
        {[
          { i: "shipping" as const, h: "Free shipping", s: "Orders $199+" },
          { i: "shield" as const, h: "Fitment guarantee", s: "Or money back" },
          { i: "return" as const, h: "30-day returns", s: "Unmounted" },
        ].map((t) => (
          <div key={t.h} className="flex items-start gap-2.5">
            <Icon name={t.i} size={20} strokeWidth={1.4} />
            <div>
              <div className="text-[12px] font-semibold text-[var(--ink)]">
                {t.h}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                {t.s}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PurchasePanel
