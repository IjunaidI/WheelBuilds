"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import Icon from "@modules/common/components/icon"
import { Button } from "@/components/ui/button"
import { addToCart } from "@lib/data/cart"
import { TireSizeOption } from "../../../data/types"
import { DEFAULT_TIRE_QTY, TRUST_STRIP } from "../../../data/pdp-config"

type TirePurchasePanelProps = {
  selectedSize: TireSizeOption | undefined
  /** Computed unit price for the current size, in cents. */
  unitPriceCents: number
}

const formatUsd = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`

/**
 * Tire PDP purchase actions: qty stepper, Add to cart, Buy now, trust strip.
 * A SIMPLIFIED mirror of the wheel PurchasePanel — no fitment chip, no
 * finish, no brand/name/price header (those render directly in hero/index.tsx
 * above the size picker). Wishlist Save is omitted (no wishlist backend yet).
 */
const TirePurchasePanel = ({ selectedSize, unitPriceCents }: TirePurchasePanelProps) => {
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  const [quantity, setQuantity] = useState(DEFAULT_TIRE_QTY)
  const [buying, setBuying] = useState(false)

  const stepQty = (delta: number) =>
    setQuantity((q) => Math.max(1, Math.min(99, q + delta)))

  const canPurchase = !!selectedSize && selectedSize.availability !== "out_of_stock"

  const handleAddToCart = async () => {
    if (!selectedSize) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedSize.variantId,
        quantity,
        countryCode,
      })
      toast.success("Added to cart", {
        description: `${quantity} × ${selectedSize.sizeLabel}`,
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
    if (!selectedSize) return
    setBuying(true)
    try {
      await addToCart({
        variantId: selectedSize.variantId,
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

  return (
    <div className="flex flex-col">
      {/* Quantity + Add to cart */}
      <div className="flex items-stretch gap-3">
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
          {canPurchase && <Icon name="arrow-right" size={16} color="white" />}
        </Button>
      </div>

      {/* Buy now — skips the cart, jumps straight to checkout. */}
      <Button
        onClick={handleBuyNow}
        disabled={!canPurchase || buying}
        className="mt-3 w-full bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
        style={{ height: 56, fontSize: 14 }}
      >
        Buy now · {formatUsd(unitPriceCents * quantity)}
        <Icon name="arrow-right" size={16} color="white" />
      </Button>

      {/* Trust strip — reused verbatim from the wheel purchase panel. */}
      <div className="grid grid-cols-3 gap-4 pt-6 mt-2">
        {TRUST_STRIP.map((t) => (
          <div key={t.heading} className="flex items-start gap-2.5">
            <Icon name={t.icon} size={20} strokeWidth={1.4} />
            <div>
              <div className="text-[12px] font-semibold text-[var(--ink)]">
                {t.heading}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                {t.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TirePurchasePanel
