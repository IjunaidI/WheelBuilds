"use client"

import SectionHeader from "@modules/common/components/section-header"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import { Button } from "@/components/ui/button"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { tireFitsVehicle } from "@lib/fitment/tire-fits-vehicle"
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

  // Reverse fit check against the active vehicle's OEM tires (size + load + speed).
  const productSpecs = product.sizeOptions.map((o) => ({
    size: o.canonicalSize,
    loadIndex: o.loadIndex ?? null,
    speedRating: o.speedRating ?? null,
  }))
  const activeFits =
    active?.oemTires?.length
      ? tireFitsVehicle(productSpecs, active.oemTires)
      : null

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow={`FITMENT · ${product.fitment.length} CONFIRMED MODELS`}
        title="Does it fit your ride?"
        description="Every vehicle below runs this tire size from the factory. The list is non-exhaustive — check your door-jamb placard or ask us to confirm."
        marginBottom={32}
      />

      {/* Active vehicle status band */}
      <div
        className="rounded-[var(--radius)] border p-5 mb-8 flex items-center gap-4"
        style={{
          borderColor: activeFits
            ? "var(--orange)"
            : active && !activeFits
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
                  This tire size is a factory fit for your vehicle.
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
          const isActive =
            Boolean(activeFits) &&
            active &&
            f.make.toLowerCase() === active.make.toLowerCase() &&
            f.model.toLowerCase() === active.model.toLowerCase()
          return (
            <TireFitmentRow
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
