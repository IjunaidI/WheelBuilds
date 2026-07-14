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
import { useGarage } from "@lib/garage/use-garage"
import { chipFitTier } from "@lib/fitment/product-has-fitting-variant"
import { openSearch } from "@lib/stores/search-store"
import { addToCart } from "@lib/data/cart"
import { insufficientStockMessage } from "@lib/util/error-message"
import { formatCentsUsd } from "@lib/util/money"
import { OffsetVariant, ProductDetail, SizeOption } from "../../data/types"
import { DEFAULT_WHEEL_QTY, LOW_STOCK_THRESHOLD, TRUST_STRIP } from "../../data/pdp-config"
import { clampQty, stepperCap } from "../../data/qty-bounds"
import { canPurchasePrice } from "../../data/price-truth"

type PurchasePanelProps = {
  product: ProductDetail
  selectedSize: SizeOption
  /**
   * The SELECTED variant's own headline price in cents (WB-090 P12), or
   * `null` when Medusa has no live price for this exact size × offset right
   * now. Never a sibling `priceCentsOverride`/`product.priceCents` fallback —
   * see `data/price-truth.ts`.
   */
  unitPriceCents: number | null
  /** The exact Medusa variant resolved from size × offset; null if unresolved. */
  selectedVariant: OffsetVariant | null
}

const formatUsd = (cents: number) => formatCentsUsd(cents)

const PurchasePanel = ({
  product,
  selectedSize,
  unitPriceCents,
  selectedVariant,
}: PurchasePanelProps) => {
  const { active } = useGarage()
  // Tier reflects the CURRENTLY SELECTED variant (size + offset + bore + this
  // finish's bolt pattern) — NOT whether the product fits somewhere. So after
  // "Show all", changing to a non-fitting size/offset/colour honestly flips the
  // chip; picking a fitting one flips it back. Same per-variant gate discovery
  // uses, so the PDP and the catalog agree. (WB-091 P4: `chipFitTier` adds an
  // "unknown" state — vehicle has no bolt-pattern data on file, OR the product
  // has none at all — the same gate the fitment band below uses, so the two
  // no longer disagree when data is simply missing rather than a real
  // mismatch.)
  const tier = active
    ? chipFitTier(
        {
          boltPatternRaw: selectedSize.boltPattern,
          centerBoreMm: selectedVariant?.centerBoreMm,
          diameterIn: selectedSize.diameter,
          widthIn: selectedSize.width,
          offsetMm: selectedVariant?.value ?? selectedSize.offsetMm,
        },
        active,
        product.boltPatternsCanonical
      )
    : null
  const router = useRouter()
  const { countryCode } = useParams() as { countryCode: string }
  // Real on-hand quantity for the resolved leaf variant (WB-090 P2/P18) — 0
  // (genuinely OOS) and undefined (unresolved variant) both fall through
  // `stepperCap` to the pre-existing flat 99 cap since Add to cart is
  // already disabled by `canPurchase` in those cases.
  const available = selectedVariant?.quantity
  const cap = stepperCap(available)
  const [quantity, setQuantity] = useState(() => clampQty(DEFAULT_WHEEL_QTY, cap))
  const [buying, setBuying] = useState(false)

  // Re-clamp whenever the effective cap changes (switching to a size/offset
  // with different — possibly lower — availability) so the stepper can never
  // carry over a quantity that exceeds the NEWLY selected variant's real
  // stock.
  useEffect(() => {
    setQuantity((q) => clampQty(q, cap))
  }, [cap])

  const stepQty = (delta: number) =>
    setQuantity((q) => clampQty(q + delta, cap))

  // Purchasable only when the variant resolved, is in stock, AND carries a
  // real (>0) price (WB-090 P12) — a genuinely price-less variant must never
  // render an enabled buy button behind a misleading "$0.00".
  const canPurchase = canPurchasePrice(
    !!selectedVariant && selectedVariant.availability !== "out_of_stock",
    unitPriceCents
  )
  // Pre-multiplied line total; null propagates "Price unavailable" into both
  // buy buttons instead of a fabricated $0.00 line.
  const lineTotalCents = unitPriceCents !== null ? unitPriceCents * quantity : null

  const handleAddToCart = async () => {
    if (!selectedVariant) return
    setBuying(true)
    try {
      const result = await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      if (result?.error) {
        toast.error("Couldn't add to cart", {
          description:
            insufficientStockMessage(result.error, selectedVariant.quantity) ??
            "Please try again in a moment.",
        })
        return
      }
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
      const result = await addToCart({
        variantId: selectedVariant.variantId,
        quantity,
        countryCode,
      })
      if (result?.error) {
        toast.error("Couldn't start checkout", {
          description:
            insufficientStockMessage(result.error, selectedVariant.quantity) ??
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

      {/* Price row — unitPriceCents null (WB-090 P12: no live price on the
          selected variant, no sibling fallback) renders honest "Price
          unavailable" copy instead of a fabricated $0.00. */}
      <div className="flex items-baseline gap-3 mt-5">
        {unitPriceCents === null ? (
          <Display size={40} as="div" tone="graphite">
            Price unavailable
          </Display>
        ) : (
          <>
            {product.originalPriceCents &&
              product.originalPriceCents > unitPriceCents && (
                <span className="text-[18px] font-[var(--mono)] text-[var(--ink-soft)] line-through">
                  {formatUsd(product.originalPriceCents)}
                </span>
              )}
            <Display size={40} as="div">
              <span style={{ color: "var(--orange)" }}>$</span>
              {formatCentsUsd(unitPriceCents).slice(1)}
            </Display>
            <Label tone="muted">PER WHEEL</Label>
          </>
        )}
      </div>

      {/* WB-090 P10: guard the empty description (mirrors the tire panel's
          `{product.description && …}`) instead of rendering a blank <p>. */}
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

      {/* Fitment chip — uses chipFitTier on the CURRENTLY SELECTED variant
          (per-variant bore + offset, paired), not fitsVehicle. The fitment
          band (fitment/index.tsx) derives its tier from buildFitView, which
          applies the same per-variant bore+offset gate — so the chip and the
          band agree on the bore/window axes even though they call different
          functions. WB-077: three fit states (fits / check / no) plus the
          no-active-vehicle prompt — CHECK gets the same amber treatment as
          the fitment band's check state. WB-091 P4: a fourth, neutral
          "unknown" state (no color accent, same as DOESN'T FIT's plain
          outline) for missing fitment data, mirroring the band's unknown
          copy instead of claiming a disproven mismatch. */}
      <div className="mt-5">
        {active ? (
          tier === "fits" ? (
            <Chip variant="accent" dot>
              FITS YOUR {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          ) : tier === "check" ? (
            <Chip
              variant="outline"
              className="!border-[rgba(184,134,11,0.35)] !bg-[rgba(184,134,11,0.08)] !text-[#8A6508]"
            >
              CHECK FIT · verify clearance
            </Chip>
          ) : tier === "unknown" ? (
            <Chip variant="outline">
              FIT DATA UNKNOWN · {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          ) : (
            <Chip variant="outline">
              DOESN'T FIT · {active.make.toUpperCase()}{" "}
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
          {canPurchase && lineTotalCents !== null
            ? `Add to cart · ${formatUsd(lineTotalCents)}`
            : unitPriceCents === null
              ? "Price unavailable"
              : "Out of stock"}
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

      {/* Only-N-left copy (WB-090 P2/P18) — an exact count instead of the
          size grid's generic "Low stock" chip, right where the shopper is
          about to pick a quantity. Suppressed for a genuinely OOS/unresolved
          variant (available <= 0 or unknown) since canPurchase already
          disables the buttons in that case. */}
      {typeof available === "number" &&
        available > 0 &&
        available <= LOW_STOCK_THRESHOLD && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--orange)",
              marginTop: 10,
            }}
          >
            Only {available} left
          </p>
        )}

      {/* Buy now — skips the cart, jumps straight to checkout. Inverted ink
          treatment so it complements the orange Add-to-cart without competing
          for the primary slot. */}
      <Button
        onClick={handleBuyNow}
        disabled={!canPurchase || buying}
        className="mt-3 w-full bg-[var(--ink)] text-white hover:bg-[var(--ink)]/90"
        style={{ height: 56, fontSize: 14 }}
      >
        {lineTotalCents !== null ? `Buy now · ${formatUsd(lineTotalCents)}` : "Price unavailable"}
        <Icon name="arrow-right" size={16} color="white" />
      </Button>

      {/* Trust strip — compressed for the purchase panel. WB-091 P6: cells
          with an `href` (currently just "Fitment guarantee") link out to the
          real policy section instead of rendering as inert text. */}
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

export default PurchasePanel
