"use client"

import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import { productFitTier } from "@lib/fitment/product-has-fitting-variant"

/**
 * One cart/order line item's slice of what `productFitTier` needs — a bare
 * structural subset of `HttpTypes.StoreCartLineItem` /
 * `HttpTypes.StoreOrderLineItem` so both call sites can pass their native
 * item shape without mapping.
 */
type FitmentCardItem = {
  variant?: { metadata?: Record<string, unknown> | null } | null
}

type FitmentVerifiedCardProps = {
  /**
   * Cart or order line items (variant.metadata carries the fitment facets).
   * Optional so a call site that hasn't threaded items yet degrades to
   * "render nothing" instead of crashing.
   */
  items?: FitmentCardItem[]
}

/**
 * Persistent fitment summary card pinned to the top of the checkout order
 * column (and reused on the order-confirmation page). Renders ONLY when
 * there's an active garage vehicle AND at least one line item genuinely
 * fits or check-fits that vehicle (B12 — this used to claim "Confirmed by
 * our team" for ANY active vehicle with zero verification). Otherwise
 * renders null; the trust strip below carries the guarantee messaging.
 */
const FitmentVerifiedCard = ({ items }: FitmentVerifiedCardProps) => {
  const { active } = useGarage()

  const anyFitOrCheck =
    active && items?.length
      ? items.some(
          (i) =>
            productFitTier([{ metadata: i.variant?.metadata }], active) !==
            "no"
        )
      : false

  if (!active || !anyFitOrCheck) return null

  return (
    <div
      className="rounded-md bg-white overflow-hidden"
      style={{ border: "1px solid var(--ink)" }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5 text-white"
        style={{ background: "var(--ink)" }}
      >
        <span className="font-[var(--mono)] text-[10px] tracking-[0.08em]">
          FITMENT CHECKED
        </span>
        <span className="inline-flex items-center gap-1.5 font-[var(--mono)] text-[10px] tracking-[0.06em] text-[var(--orange)]">
          <Icon name="shield" size={11} color="#FF6A00" strokeWidth={2} />
          GUARANTEED
        </span>
      </div>
      <div className="px-4 py-3.5">
        <div className="font-[var(--mono)] text-[9px] uppercase tracking-[0.08em] text-[var(--orange)] mb-1">
          VEHICLE
        </div>
        <div className="font-[var(--display)] text-[18px] text-[var(--ink)] tracking-[-0.005em] mb-3">
          {active.year} {active.make} {active.model}
          {active.trim ? ` ${active.trim}` : ""}
        </div>
        <p className="text-[11px] text-[var(--graphite)] leading-[1.5]">
          Checked against wheel-size.com specs for your {active.year}{" "}
          {active.make} {active.model}. If it doesn&apos;t fit, we cover
          return shipping and refund every penny.
        </p>
      </div>
    </div>
  )
}

export default FitmentVerifiedCard
