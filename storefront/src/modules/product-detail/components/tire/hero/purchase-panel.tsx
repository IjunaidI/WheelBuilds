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
import { addToCart } from "@lib/data/cart"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { tireFitsVehicle, TireFitSpec } from "@lib/fitment/tire-fits-vehicle"
import { TireProductDetail, TireSizeOption } from "../../../data/types"
import { DEFAULT_TIRE_QTY, TRUST_STRIP } from "../../../data/pdp-config"

type TirePurchasePanelProps = {
  product: TireProductDetail
  selectedSize: TireSizeOption | undefined
  /** Computed unit price for the current size, in cents. */
  unitPriceCents: number
}

const formatUsd = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`

/**
 * Tire PDP purchase block. Mirrors the wheel PurchasePanel one-for-one:
 * brand / name / price / description header, the fit chip, a hairline
 * Separator, then qty stepper + Add to cart + Save, Buy now, and the trust
 * strip. Tire-specific only where the data demands it (single Size axis, no
 * finish/offset, "PER TIRE").
 */
const TirePurchasePanel = ({
  product,
  selectedSize,
  unitPriceCents,
}: TirePurchasePanelProps) => {
  const { active } = useGarage()
  // Honesty chip (WB-056 analog): reflects whether the CURRENTLY SELECTED size
  // fits the active vehicle's OEM tires (size + load + speed) — NOT whether any
  // offered size fits. In fit mode the picker only shows fitting sizes, so the
  // chip reads "fits"; but once the shopper hits "Show all" and picks a
  // non-fitting size, that's a deliberate override (mirrors the wheel PDP's
  // per-variant chip), so the chip must honestly flip to "MAY NOT FIT".
  const selectedSpec: TireFitSpec | null = selectedSize
    ? {
        size: selectedSize.canonicalSize,
        loadIndex: selectedSize.loadIndex ?? null,
        speedRating: selectedSize.speedRating ?? null,
      }
    : null
  const fits =
    !!active?.oemTires?.length &&
    !!selectedSpec &&
    tireFitsVehicle([selectedSpec], active.oemTires)
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
        description: `${quantity} × ${product.name} · ${selectedSize.sizeLabel}`,
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

  const handleSave = () => {
    // No wishlist backend yet. Keep the toast (same as the wheel panel).
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
        <Display size={40} as="div">
          <span style={{ color: "var(--orange)" }}>$</span>
          {Math.round(unitPriceCents / 100).toLocaleString()}
        </Display>
        <Label tone="muted">PER TIRE</Label>
      </div>

      {product.description && (
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
      )}

      {/* Fitment chip — same per-selection verdict as the fitment band below,
          so they can never disagree. */}
      <div className="mt-5">
        {active ? (
          fits ? (
            <Chip variant="accent" dot>
              FITS YOUR {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          ) : (
            <Chip variant="outline">
              MAY NOT FIT · {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          )
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
