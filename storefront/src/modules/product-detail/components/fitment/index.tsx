"use client"

import SectionHeader from "@modules/common/components/section-header"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { fitsVehicle } from "@lib/fitment/fits-vehicle"
import { buildFitView } from "../../data/fit-view"
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
  const activeFits = !activeUnknown && !!fitView?.hasFit
  const activeNoFit = Boolean(active) && !activeUnknown && !activeFits

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow={`FITMENT · ${product.fitment.length} CONFIRMED MODELS`}
        title="Will it fit your build?"
        description="Each vehicle below matches this wheel's bolt pattern and hub bore, per wheel-size.com data. We also check the wheel's size against typical size windows for your vehicle."
        marginBottom={32}
      />

      {/* Active vehicle status band */}
      <div
        className="rounded-[var(--radius)] border p-5 mb-8 flex items-center gap-4"
        style={{
          borderColor: activeFits
            ? "var(--orange)"
            : activeUnknown
              ? "var(--hairline)"
              : activeNoFit
                ? "var(--ink-soft)"
                : "var(--hairline)",
          background: activeFits ? "rgba(255,106,0,0.04)" : "white",
        }}
      >
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: activeFits
              ? "var(--orange)"
              : active
                ? "var(--soft)"
                : "var(--soft)",
            color: activeFits ? "white" : "var(--ink)",
          }}
        >
          <Icon
            name={activeFits ? "check" : "garage"}
            size={18}
            color={activeFits ? "white" : "#0F0F10"}
            strokeWidth={1.8}
          />
        </div>
        <div className="flex-1 min-w-0">
          {active ? (
            activeFits ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  Fits your{" "}
                  {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  {verdict && !verdict.withinWindow
                    ? "Bolt pattern and hub bore clear, but this size is outside the typical size window for your vehicle — confirm offset before ordering."
                    : "Add this wheel to cart — we'll verify final offset against your build at order review."}
                </div>
              </>
            ) : activeUnknown ? (
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
          // Helper: check if entry.year matches active.year (handles year ranges like "2013–2017")
          const yearMatches = () => {
            if (!active) return false
            // entry.year is a string (e.g., "2021" or "2013–2017")
            // active.year is a number (e.g., 2021)
            const parts = f.year.match(/^(\d+)\s*[–-]\s*(\d+)$/)
            if (parts) {
              // Year range: check if active.year falls within [start, end]
              const start = parseInt(parts[1], 10)
              const end = parseInt(parts[2], 10)
              return active.year >= start && active.year <= end
            }
            // Single year: exact match
            return String(active.year) === f.year
          }

          // Helper: check if trims match (case-insensitive, only if both present)
          const trimMatches = () => {
            if (!active) return false
            // Only require trim match if BOTH have a trim value
            if (!active.trim || !f.trim) return true
            return active.trim.toLowerCase() === f.trim.toLowerCase()
          }

          const isActive =
            Boolean(activeFits) &&
            active &&
            f.make.toLowerCase() === active.make.toLowerCase() &&
            f.model.toLowerCase() === active.model.toLowerCase() &&
            yearMatches() &&
            trimMatches()
          return (
            <FitmentRow
              key={`${f.make}-${f.model}-${i}`}
              entry={f}
              highlight={Boolean(isActive)}
            />
          )
        })}
      </div>
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
