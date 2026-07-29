"use client"

import SectionHeader from "@modules/common/components/section-header"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { fitmentCheckHref } from "@modules/support/fitment-check-link"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { fitsVehicle } from "@lib/fitment/fits-vehicle"
import { entryMatchesVehicle } from "@lib/fitment/vehicle-entry-match"
import { FitTier } from "@lib/fitment/fit-tier"
import { buildFitView, fitViewAllWithinWindow } from "../../data/fit-view"
import { FitmentEntry, ProductDetail } from "../../data/types"

type FitmentProps = {
  product: ProductDetail
}

/**
 * Vehicle compatibility list. Shows the active garage vehicle's status at the
 * top, then a scrollable table of confirmed fits.
 *
 * product.fitment is populated by the PDP loader via reverse fitment over the
 * wheel-size cache (WB-009). A future enhancement could add a YMM combobox to
 * filter the list.
 */
const Fitment = ({ product }: FitmentProps) => {
  const { active } = useGarage()

  // Parametric fitment check against the active vehicle's wheel-size.com spec
  // (bolt pattern + hub bore hard gates, plus the diameter/width/offset window).
  const verdict = active ? fitsVehicle(product, active) : null
  // S5: no bolt-pattern data on file for this vehicle — informational, not a
  // "doesn't fit" mismatch claim.
  const activeUnknown = verdict?.status === "unknown"
  // WB-072 review: fitsVehicle checks hub bore at PRODUCT level
  // (variants[0].metadata.center_bore_mm — an arbitrary single variant), while
  // the hero (?fit=1) and fit-mode filtering use buildFitView/variantFitsVehicle,
  // which check bore PER VARIANT paired with the in-window offset. For a
  // multi-bore wheel those two checks can disagree — in either direction: the
  // band could over-claim (product-level clears, no real variant does) or
  // under-claim (product-level fails on an arbitrary variant, while the
  // in-window variant's own bore actually clears). Deriving the band's FITS
  // boolean from buildFitView — the per-variant-correct check the hero already
  // uses — resolves both directions so the band and hero always agree. Skip
  // the (non-free) computation when there's no active vehicle or the verdict
  // is already "unknown".
  const fitView =
    active && verdict && verdict.status !== "unknown" ? buildFitView(product, active) : null
  // WB-077: reconcile buildFitView's per-variant-correct bestTier ("fits" |
  // "check" | "no") with fitsVehicle's "unknown" gate (no bolt-pattern data on
  // file at all, for either side) into the single four-tier value every band
  // branch below switches on. "no-fit" absorbs fitView's "no" — a real
  // physical mismatch (bolt pattern or bore), not a missing-data case.
  const tier: FitTier = activeUnknown
    ? "unknown"
    : fitView
      ? fitView.bestTier === "no"
        ? "no-fit"
        : fitView.bestTier
      : "no-fit"

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        // WB-091 P14: an empty confirmed-models list previously still rendered
        // "FITMENT · 0 CONFIRMED MODELS", which reads as "fits nothing" rather
        // than "we haven't listed your vehicle yet". Only show the count once
        // there's something to count.
        eyebrow={product.fitment.length > 0 ? `FITMENT · ${product.fitment.length} CONFIRMED MODELS` : "FITMENT"}
        title="Will it fit your build?"
        description="Each vehicle below matches this wheel's bolt pattern and hub bore, per wheel-size.com data. We also check the wheel's size against typical size windows for your vehicle. This list is non-exhaustive — check your door-jamb placard or ask us to confirm."
        action={
          <Button onClick={openSearch} size="sm" variant="outline">
            <Icon name="garage" size={14} strokeWidth={1.6} />
            Check YOUR vehicle
          </Button>
        }
        marginBottom={32}
      />

      {/* Active vehicle status band */}
      <div
        className="rounded-[var(--radius)] border p-5 mb-8 flex items-center gap-4"
        style={{
          borderColor:
            tier === "fits"
              ? "var(--orange)"
              : tier === "check"
                ? "rgba(184,134,11,0.35)"
                : tier === "no-fit"
                  ? "var(--ink-soft)"
                  : "var(--hairline)",
          background:
            tier === "fits"
              ? "rgba(255,106,0,0.04)"
              : tier === "check"
                ? "rgba(184,134,11,0.06)"
                : "white",
        }}
      >
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            background:
              tier === "fits"
                ? "var(--orange)"
                : tier === "check"
                  ? "rgba(184,134,11,0.12)"
                  : "var(--soft)",
            color: tier === "fits" ? "white" : "var(--ink)",
          }}
        >
          <Icon
            name={tier === "fits" ? "check" : tier === "check" ? "shield" : "garage"}
            size={18}
            color={tier === "fits" ? "white" : tier === "check" ? "#B8860B" : "#0F0F10"}
            strokeWidth={1.8}
          />
        </div>
        <div className="flex-1 min-w-0">
          {active ? (
            tier === "fits" ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  Fits your{" "}
                  {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  {/* WB-091 P5: derived from buildFitView's per-variant tiers
                      (the same data the "fits" badge above already came from),
                      not fitsVehicle()'s product-level `withinWindow` — that
                      reads a single arbitrary variant's bore
                      (product.specs.centerBoreMm) and can disagree with the
                      per-variant-correct view for a multi-bore wheel.
                      WB-091 review fix: bestTier "fits" means AT LEAST ONE
                      size is confirmed — it does not mean every size is. The
                      previous copy rendered the "check"-tier caution
                      ("outside the typical size window — confirm offset")
                      under a "Fits your {vehicle}" header whenever any other
                      size on this product wasn't within window, which reads
                      as self-contradictory. Both branches below stay
                      positive; the per-selection chip on the purchase panel
                      remains the honest authority for whichever size is
                      actually picked. */}
                  {fitView && !fitViewAllWithinWindow(fitView)
                    ? "A fitting size is confirmed for your vehicle — pick your size below; the chip on your selected size shows its exact verdict."
                    : "Bolt pattern, hub bore, and size are confirmed for your vehicle."}
                </div>
              </>
            ) : tier === "check" ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  CHECK FIT — aggressive fitment for your {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  {verdict?.reasons[0] ??
                    "Bolt pattern and hub bore clear, but this size is outside the typical window for your vehicle. Verify clearance before ordering."}
                </div>
              </>
            ) : tier === "unknown" ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  We don't have fitment data for your {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""} yet.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  This isn't a mismatch — we just haven't confirmed spec for your vehicle. Talk to fitment support before ordering.
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  Doesn't fit your {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  {verdict?.reasons[0] ??
                    "This wheel's size or bore is outside your vehicle's spec for a fitting variant."}
                </div>
              </>
            )
          ) : (
            <>
              <div className="text-[14px] font-semibold text-[var(--ink)]">
                Pick a vehicle to check fitment instantly.
              </div>
              <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                Your selection is saved across the site.
              </div>
            </>
          )}
        </div>
        {!active && (
          <Button onClick={openSearch} size="sm">
            <Icon name="garage" size={14} strokeWidth={1.6} />
            Pick vehicle
          </Button>
        )}
      </div>

      {/* Fitment list — single column on mobile, two columns on small+. Each
          row draws its own bottom hairline; the section uses border-top only
          so the final row doubles as the section's bottom frame. */}
      <div className="grid grid-cols-1 small:grid-cols-2 gap-x-8 gap-y-0 border-t border-[var(--hairline)]">
        {product.fitment.map((f, i) => {
          // Range-aware year + best-effort trim matching, shared with the
          // tire fitment list (see lib/fitment/vehicle-entry-match.ts).
          const isActive = tier === "fits" && entryMatchesVehicle(f, active)
          return (
            <FitmentRow
              key={`${f.make}-${f.model}-${i}`}
              entry={f}
              highlight={Boolean(isActive)}
            />
          )
        })}
      </div>

      {/* WB-119 Q-20: the wheel PDP had no route forward for a shopper whose
          vehicle isn't in the confirmed list — the tyre PDP had this CTA and
          this one did not. Same prefilled destination, same wording. */}
      <p className="mt-6 text-[12px] text-[var(--ink-soft)] font-[var(--mono)] leading-relaxed">
        Don&apos;t see your vehicle?{" "}
        <LocalizedClientLink
          href={fitmentCheckHref({ vehicle: active, productHandle: product.handle })}
          className="text-[var(--orange-deep)] font-semibold no-underline hover:underline"
        >
          Submit your vehicle for a fitment check
        </LocalizedClientLink>{" "}
        — we&apos;ll get back to you by email.
      </p>
    </section>
  )
}

const FitmentRow = ({
  entry,
  highlight,
}: {
  entry: FitmentEntry
  highlight: boolean
}) => (
  <div
    className="flex items-center gap-4 py-4 border-b border-[var(--hairline)]"
    style={{
      background: highlight ? "rgba(255,106,0,0.04)" : "transparent",
      paddingLeft: highlight ? 12 : 0,
      paddingRight: highlight ? 12 : 0,
      borderRadius: highlight ? "var(--radius)" : 0,
    }}
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[var(--ink)]">
          {entry.year} {entry.make} {entry.model}
          {entry.trim ? ` ${entry.trim}` : ""}
        </span>
        {highlight && (
          <Chip variant="accent" size="sm">
            YOUR VEHICLE
          </Chip>
        )}
      </div>
      {(entry.boltPattern || entry.notes) && (
        <div className="text-[11px] text-[var(--ink-soft)] font-[var(--mono)] mt-1">
          {entry.boltPattern && <span>{entry.boltPattern}</span>}
          {entry.boltPattern && entry.notes && <span> · </span>}
          {entry.notes && <span>{entry.notes}</span>}
        </div>
      )}
    </div>
    <Icon name="check" size={14} color="#FF6A00" strokeWidth={2.5} />
  </div>
)

export default Fitment
