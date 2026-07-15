"use client"

import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import { orderFitSummary, type FitSummaryItem } from "./order-fit-summary"

/**
 * One cart/order line item's slice of what `orderFitSummary` needs — a bare
 * structural subset of `HttpTypes.StoreCartLineItem` /
 * `HttpTypes.StoreOrderLineItem` so both call sites can pass their native
 * item shape without mapping.
 */
type FitmentCardItem = FitSummaryItem

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
 *
 * C10: the CHECKED/GUARANTEED claim requires EVERY line to individually
 * reach the "fits" tier (`orderFitSummary` — `.every()`, not the old
 * `.some()`, which let one fitting line cover for others that didn't fit at
 * all). A mixed order instead renders a neutral "partial" state with no
 * guarantee claim.
 */
const FitmentVerifiedCard = ({ items }: FitmentVerifiedCardProps) => {
  const { active } = useGarage()

  const summary = orderFitSummary(items, active)

  if (!active || summary === "none") return null

  const allFit = summary === "all"

  return (
    <div
      className="rounded-md bg-white overflow-hidden"
      style={{ border: `1px solid ${allFit ? "var(--ink)" : "var(--hairline)"}` }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{
          background: allFit ? "var(--ink)" : "var(--soft)",
          color: allFit ? "white" : "var(--ink)",
        }}
      >
        <span className="font-[var(--mono)] text-[10px] tracking-[0.08em]">
          {allFit ? "FITMENT CHECKED" : "FITMENT PARTIALLY VERIFIED"}
        </span>
        {allFit && (
          <span className="inline-flex items-center gap-1.5 font-[var(--mono)] text-[10px] tracking-[0.06em] text-[var(--orange)]">
            <Icon name="shield" size={11} color="#FF6A00" strokeWidth={2} />
            GUARANTEED
          </span>
        )}
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
          {allFit ? (
            <>
              Checked against wheel-size.com specs for your {active.year}{" "}
              {active.make} {active.model}. If our fitment check was wrong,
              we cover the return.
            </>
          ) : (
            <>
              Some items in this order weren&apos;t fully confirmed against
              your {active.year} {active.make} {active.model}. Double-check
              specs before you mount.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default FitmentVerifiedCard
