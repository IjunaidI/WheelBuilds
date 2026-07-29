"use client"

import SectionHeader from "@modules/common/components/section-header"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { useSelectedTireFit } from "@lib/stores/selected-tire-fit"
import { tireFitVerdict } from "@lib/fitment/tire-fits-vehicle"
import { entryMatchesVehicle } from "@lib/fitment/vehicle-entry-match"
import { fitmentCheckHref } from "@modules/support/fitment-check-link"
import { TireFitmentEntry, TireProductDetail } from "../../data/types"

type TireFitmentProps = {
  product: TireProductDetail
}

/**
 * Vehicle compatibility list. Shows the active garage vehicle's status at the
 * top, then a scrollable table of confirmed fits.
 *
 * product.fitment is populated by the PDP loader via reverse fitment over the
 * wheel-size cache (WB-065). A future enhancement could add a YMM combobox to
 * filter the list.
 */
const TireFitment = ({ product }: TireFitmentProps) => {
  const { active } = useGarage()
  // The size currently selected in the hero (published to a shared store). The
  // band reflects THIS selection so it stays honest when the shopper hits
  // "Show all" and picks a non-fitting size — same per-selection honesty as the
  // hero's purchase-panel chip.
  const selectedSpec = useSelectedTireFit()

  // Reverse fit check against the active vehicle's OEM tires (size + load +
  // speed). Prefer the selected size; before the hero has published one (first
  // paint / SSR), fall back to "does ANY offered size fit" so the band still
  // renders a sensible state instead of flashing empty.
  const productSpecs = product.sizeOptions.map((o) => ({
    size: o.canonicalSize,
    loadIndex: o.loadIndex ?? null,
    speedRating: o.speedRating ?? null,
  }))
  // Three-state verdict (WB-091 P3): "unknown" when the vehicle simply has no
  // OEM tire data on file is NOT the same as "no" (a disproven mismatch) — a
  // null/false collapse here previously rendered "runs a different factory
  // tire size" for vehicles we've never checked at all.
  const verdict = active
    ? selectedSpec
      ? tireFitVerdict([selectedSpec], active.oemTires ?? [])
      : tireFitVerdict(productSpecs, active.oemTires ?? [])
    : null
  const activeFits = verdict === "fits"

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        // Mirrors the wheel fitment eyebrow fix (WB-091 P14,
        // components/fitment/index.tsx): an empty confirmed-models list
        // previously still rendered "FITMENT · 0 CONFIRMED MODELS", which
        // reads as "fits nothing" rather than "we haven't listed your
        // vehicle yet". Only show the count once there's something to count.
        eyebrow={product.fitment.length > 0 ? `FITMENT · ${product.fitment.length} CONFIRMED MODELS` : "FITMENT"}
        title="Does it fit your ride?"
        description="Every vehicle below runs this tire size from the factory. The list is non-exhaustive — check your door-jamb placard or ask us to confirm."
        marginBottom={32}
      />

      {/* Active vehicle status band — three states when a vehicle is active
          (fits / no / unknown), plus the no-active-vehicle prompt. "unknown"
          shares the neutral hairline/white treatment with "no active vehicle"
          since neither is a disproven mismatch. */}
      <div
        className="rounded-[var(--radius)] border p-5 mb-8 flex items-center gap-4"
        style={{
          borderColor: activeFits
            ? "var(--orange)"
            : verdict === "no"
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
            verdict === "fits" ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  Fits your{" "}
                  {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  This tire size is a factory fit for your vehicle.
                </div>
              </>
            ) : verdict === "unknown" ? (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  We don&apos;t have factory tire data for your{" "}
                  {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""} yet.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  This isn&apos;t a mismatch — check your door placard for the
                  factory tire size before ordering.
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  {active.year} {active.make} {active.model} runs a different
                  factory tire size.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  This size isn't the OEM fit for your vehicle — check your
                  placard before ordering.
                </div>
              </>
            )
          ) : (
            <>
              <div className="text-[14px] font-semibold text-[var(--ink)]">
                Pick a vehicle to check the fit instantly.
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
          // Highlight the active vehicle's row whenever it's in the confirmed
          // list — independent of the currently selected size, so switching to a
          // non-OEM size doesn't un-mark "YOUR VEHICLE" (the band above already
          // carries the per-selection fit verdict). Matches make + model
          // (case-insensitive), range-aware year, and best-effort trim — same
          // logic as the wheel fitment list (WB-091 P13: previously make+model
          // only, so e.g. a 1998 Civic highlighted the 2021 Civic row).
          const isActive = entryMatchesVehicle(f, active)
          return (
            <TireFitmentRow
              key={`${f.make}-${f.model}-${i}`}
              entry={f}
              highlight={Boolean(isActive)}
            />
          )
        })}
      </div>

      {/* WB-119 Q-20: this used to link to a /contact page with no form on it,
          under a promise of a reply "within 24 hours" — so the highest-intent
          lead the site can capture went nowhere. The href now carries the
          active vehicle and this product so the form arrives prefilled, and
          the timeframe claim is dropped until the client confirms one
          (docs/reference/client-input-needed.md item 5). */}
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

const TireFitmentRow = ({
  entry,
  highlight,
}: {
  entry: TireFitmentEntry
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
      <div className="text-[11px] text-[var(--ink-soft)] font-[var(--mono)] mt-1">
        <span>{entry.size}</span>
      </div>
    </div>
    <Icon name="check" size={14} color="#FF6A00" strokeWidth={2.5} />
  </div>
)

export default TireFitment
