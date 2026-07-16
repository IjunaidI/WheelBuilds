"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { addToCart } from "@lib/data/cart"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { tireFitVerdict, TireFitSpec } from "@lib/fitment/tire-fits-vehicle"
import { insufficientStockMessage } from "@lib/util/error-message"
import { formatCentsUsd } from "@lib/util/money"
import { TireProductDetail, TireSizeOption } from "../../../data/types"
import { DEFAULT_TIRE_QTY, LOW_STOCK_THRESHOLD, TRUST_STRIP } from "../../../data/pdp-config"
import { clampQty, stepperCap } from "../../../data/qty-bounds"
import { canPurchasePrice } from "../../../data/price-truth"

type TirePurchasePanelProps = {
  product: TireProductDetail
  selectedSize: TireSizeOption | undefined
  /**
   * The selected size's own headline price in cents (WB-090 P12), or `null`
   * when Medusa has no live price for this exact size right now. Never a
   * product-level fallback — see `data/price-truth.ts`.
   */
  unitPriceCents: number | null
}

const formatUsd = (cents: number) => formatCentsUsd(cents)

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
  // per-variant chip), so the chip must honestly flip to "MAY NOT FIT". A
  // vehicle with no OEM tire data on file at all is a THIRD, neutral state
  // (WB-091 P3) — "no data" must never render as "MAY NOT FIT".
  const selectedSpec: TireFitSpec | null = selectedSize
    ? {
        size: selectedSize.canonicalSize,
        loadIndex: selectedSize.loadIndex ?? null,
        speedRating: selectedSize.speedRating ?? null,
      }
    : null
  const verdict = active
    ? tireFitVerdict(selectedSpec ? [selectedSpec] : [], active.oemTires ?? [])
    : null
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  // Real on-hand quantity for the selected size's variant (WB-090 P2/P18) —
  // 0 (genuinely OOS) and undefined (no size resolved yet) both fall through
  // `stepperCap` to the pre-existing flat 99 cap since Add to cart is
  // already disabled by `canPurchase` in those cases.
  const available = selectedSize?.quantity
  const cap = stepperCap(available)
  const [quantity, setQuantity] = useState(() => clampQty(DEFAULT_TIRE_QTY, cap))
  const [buying, setBuying] = useState(false)

  // Re-clamp whenever the effective cap changes (switching to a size with
  // different — possibly lower — availability) so the stepper can never
  // carry over a quantity that exceeds the NEWLY selected size's real stock.
  useEffect(() => {
    setQuantity((q) => clampQty(q, cap))
  }, [cap])

  const stepQty = (delta: number) =>
    setQuantity((q) => clampQty(q + delta, cap))

  // Purchasable only when a size resolved, is in stock, AND carries a real
  // (>0) price (WB-090 P12) — a genuinely price-less size must never render
  // an enabled buy button behind a misleading "$0.00".
  const canPurchase = canPurchasePrice(
    !!selectedSize && selectedSize.availability !== "out_of_stock",
    unitPriceCents
  )
  // Pre-multiplied line total; null propagates "Price unavailable" into both
  // buy buttons instead of a fabricated $0.00 line.
  const lineTotalCents = unitPriceCents !== null ? unitPriceCents * quantity : null

  const handleAddToCart = async () => {
    if (!selectedSize) return
    setBuying(true)
    try {
      const result = await addToCart({
        variantId: selectedSize.variantId,
        quantity,
        countryCode,
      })
      if (result?.error) {
        toast.error("Couldn't add to cart", {
          description:
            insufficientStockMessage(result.error, selectedSize.quantity) ??
            "Please try again in a moment.",
        })
        return
      }
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
      const result = await addToCart({
        variantId: selectedSize.variantId,
        quantity,
        countryCode,
      })
      if (result?.error) {
        toast.error("Couldn't start checkout", {
          description:
            insufficientStockMessage(result.error, selectedSize.quantity) ??
            "Please try again in a moment.",
        })
        setBuying(false)
        return
      }
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

      {/* Price row — unitPriceCents null (WB-090 P12: no live price on the
          selected size, no product-level fallback) renders honest "Price
          unavailable" copy instead of a fabricated $0.00. */}
      <div className="flex items-baseline gap-3 mt-5">
        {unitPriceCents === null ? (
          <Display size={40} as="div" tone="graphite">
            Price unavailable
          </Display>
        ) : (
          <>
            <Display size={40} as="div">
              <span style={{ color: "var(--orange)" }}>$</span>
              {formatCentsUsd(unitPriceCents).slice(1)}
            </Display>
            <Label tone="muted">PER TIRE</Label>
          </>
        )}
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
          so they can never disagree. Three states: fits (accent), no data on
          file (neutral outline — NOT a mismatch claim), and a real mismatch
          (outline, "MAY NOT FIT"). */}
      <div className="mt-5">
        {active ? (
          verdict === "fits" ? (
            <Chip variant="accent" dot>
              FITS YOUR {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          ) : verdict === "unknown" ? (
            <Chip variant="outline">
              CHECK FIT · NO DATA FOR {active.year} {active.make.toUpperCase()}{" "}
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
          {canPurchase && lineTotalCents !== null
            ? `Add to cart · ${formatUsd(lineTotalCents)}`
            : unitPriceCents === null
              ? "Price unavailable"
              : "Out of stock"}
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

      {/* Only-N-left copy (WB-090 P2/P18) — mirrors the wheel panel. */}
      {typeof available === "number" &&
        available > 0 &&
        available <= LOW_STOCK_THRESHOLD && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--orange-deep)",
              marginTop: 10,
            }}
          >
            Only {available} left
          </p>
        )}

      {/* Buy now — skips the cart, jumps straight to checkout. */}
      <Button
        onClick={handleBuyNow}
        disabled={!canPurchase || buying}
        className="mt-3 w-full bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
        style={{ height: 56, fontSize: 14 }}
      >
        {lineTotalCents !== null ? `Buy now · ${formatUsd(lineTotalCents)}` : "Price unavailable"}
        <Icon name="arrow-right" size={16} color="white" />
      </Button>

      {/* Trust strip — reused verbatim from the wheel purchase panel,
          including the WB-091 P6 linked "Fitment guarantee" cell. */}
      <div className="grid grid-cols-3 gap-4 pt-6 mt-2">
        {TRUST_STRIP.map((t) => {
          const body = (
            <>
              <Icon name={t.icon} size={20} strokeWidth={1.4} />
              <div>
                <div className="text-[12px] font-semibold text-[var(--ink)]">
                  {t.heading}
                </div>
                <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                  {t.sub}
                </div>
              </div>
            </>
          )
          return t.href ? (
            <LocalizedClientLink
              key={t.heading}
              href={t.href}
              className="flex items-start gap-2.5 no-underline"
            >
              {body}
            </LocalizedClientLink>
          ) : (
            <div key={t.heading} className="flex items-start gap-2.5">
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default TirePurchasePanel
