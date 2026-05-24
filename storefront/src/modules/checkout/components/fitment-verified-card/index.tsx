"use client"

import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"

/**
 * Persistent fitment summary card pinned to the top of the checkout order
 * column. Reads the active garage vehicle so the user is reassured their pick
 * was confirmed for *their* truck. Hidden entirely when no vehicle is set —
 * the trust strip below carries the guarantee messaging in that case.
 *
 * The wheel-spec line (size · ET · bolt) is a placeholder for Phase 2.1
 * fitment data — when a real OEM-spec lookup ships, derive these per-vehicle.
 */
const FitmentVerifiedCard = () => {
  const { active } = useGarage()

  if (!active) return null

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
          FITMENT VERIFIED
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
          Confirmed by our team. If it doesn&apos;t fit, we cover return
          shipping and refund every penny.
        </p>
      </div>
    </div>
  )
}

export default FitmentVerifiedCard
