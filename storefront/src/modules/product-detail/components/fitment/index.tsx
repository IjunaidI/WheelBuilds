"use client"

import SectionHeader from "@modules/common/components/section-header"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import Icon from "@modules/common/components/icon"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import { FitmentEntry, ProductDetail } from "../../data/types"

type FitmentProps = {
  product: ProductDetail
}

/**
 * Vehicle compatibility list. Shows the active garage vehicle's status at the
 * top, then a scrollable table of confirmed fits.
 *
 * TODO(integration): when Phase 2.1 fitment data lands, replace
 * product.fitment with a per-request fitment lookup and add a YMM combobox
 * to filter the list.
 */
const Fitment = ({ product }: FitmentProps) => {
  const { active } = useGarage()

  // Heuristic for "does the active vehicle fit?" — naive substring match
  // against the make + model. Replace with real fitment table lookup later.
  const activeFits = active
    ? product.fitment.some(
        (f) =>
          f.make.toLowerCase() === active.make.toLowerCase() &&
          f.model.toLowerCase() === active.model.toLowerCase()
      )
    : null

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow={`FITMENT · ${product.fitment.length} CONFIRMED MODELS`}
        title="Will it fit your build?"
        description="Every fitment below has been bench-verified for offset, hub bore, and brake clearance. The list is non-exhaustive — submit your build for spec confirmation."
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
                  Confirmed fit for your{" "}
                  {active.year} {active.make} {active.model}
                  {active.trim ? ` ${active.trim}` : ""}
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  Add this wheel to cart — we'll verify final offset against your
                  build at order review.
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] font-semibold text-[var(--ink)]">
                  Your {active.year} {active.make} {active.model} isn't on the
                  confirmed list.
                </div>
                <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                  This wheel might still fit with the right offset. Talk to
                  fitment support before ordering.
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
          const isActive =
            active &&
            f.make.toLowerCase() === active.make.toLowerCase() &&
            f.model.toLowerCase() === active.model.toLowerCase()
          return (
            <FitmentRow
              key={`${f.make}-${f.model}-${i}`}
              entry={f}
              highlight={Boolean(isActive)}
            />
          )
        })}
      </div>

      <p className="mt-6 text-[12px] text-[var(--ink-soft)] font-[var(--mono)] leading-relaxed">
        Don't see your vehicle?{" "}
        <a
          href="#"
          className="text-[var(--orange)] font-semibold no-underline hover:underline"
        >
          Submit your build for fitment
        </a>{" "}
        — we usually confirm within 24 hours.
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
