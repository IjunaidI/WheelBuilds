"use client"

import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import { useTireQuery } from "../../use-tire-query"
import { formatCentsUsd } from "@lib/util/money"

const TIRE_TYPE_LABELS: Record<string, string> = {
  passenger: "Passenger",
  "light-truck": "Light truck",
  other: "Specialty",
}

const formatPrice = (cents: number) => formatCentsUsd(cents)

/**
 * Mirrors modules/discovery/components/active-chips — a removable chip per
 * active filter + "Clear all", plus the `Fits:` chip (WB-063 T5) that clears
 * the OEM-size auto-fit (sets fit=0) when removed.
 */
const TireActiveChips = () => {
  const {
    filters,
    removeArrayFilter,
    setScalarFilter,
    clearAll,
    clearFit,
    isAnyFilterActive,
  } = useTireQuery()
  const { active } = useGarage()
  const sp = useSearchParams()

  // WB-079 B1: a fit param can be present with no active vehicle (garage
  // cleared/switched after the param was written) — show the chip whenever
  // the param is present, not only while `active` is set, so a stale filter
  // is always removable rather than lingering invisibly.
  const hasFitParam = sp.get("fit") !== null && sp.get("fit") !== "0"
  const fitActive = hasFitParam

  if (!isAnyFilterActive && !fitActive) return null

  type ChipRow = {
    key: string
    label: string
    onRemove: () => void
  }

  const chips: ChipRow[] = []

  if (fitActive) {
    chips.push({
      key: "fit",
      label: active ? `Fits: ${active.year} ${active.make} ${active.model}` : "Fits: your vehicle",
      onRemove: clearFit,
    })
  }

  for (const b of filters.brands) {
    chips.push({
      key: `brand-${b}`,
      label: b,
      onRemove: () => removeArrayFilter("brands", b),
    })
  }
  for (const d of filters.rimDiameters) {
    chips.push({
      key: `rim-${d}`,
      label: `${d}"`,
      onRemove: () => removeArrayFilter("rimDiameters", d),
    })
  }
  for (const s of filters.sizes) {
    chips.push({
      key: `size-${s}`,
      label: s,
      onRemove: () => removeArrayFilter("sizes", s),
    })
  }
  for (const t of filters.tireTypes) {
    chips.push({
      key: `tire-type-${t}`,
      label: TIRE_TYPE_LABELS[t] ?? t,
      onRemove: () => removeArrayFilter("tireTypes", t),
    })
  }
  for (const sr of filters.speedRatings) {
    chips.push({
      key: `speed-${sr}`,
      label: sr,
      onRemove: () => removeArrayFilter("speedRatings", sr),
    })
  }
  for (const l of filters.loadIndexes) {
    chips.push({
      key: `load-${l}`,
      label: String(l),
      onRemove: () => removeArrayFilter("loadIndexes", l),
    })
  }
  if (filters.priceMinCents != null) {
    chips.push({
      key: "price-min",
      label: `Min ${formatPrice(filters.priceMinCents)}`,
      onRemove: () => setScalarFilter("priceMinCents", undefined),
    })
  }
  if (filters.priceMaxCents != null) {
    chips.push({
      key: "price-max",
      label: `Max ${formatPrice(filters.priceMaxCents)}`,
      onRemove: () => setScalarFilter("priceMaxCents", undefined),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
            "bg-[var(--ink)] text-white hover:bg-[var(--graphite)]"
          )}
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <Icon name="x" size={12} color="white" strokeWidth={2.2} />
        </button>
      ))}
      <Button
        variant="link"
        size="sm"
        onClick={clearAll}
        className="h-auto p-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--orange)] no-underline hover:no-underline ml-2"
      >
        Clear all
      </Button>
    </div>
  )
}

export default TireActiveChips
