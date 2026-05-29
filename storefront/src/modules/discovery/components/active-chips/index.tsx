"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Icon from "@modules/common/components/icon"
import { useDiscoveryQuery } from "../../data/use-discovery-query"

const FINISH_LABELS: Record<string, string> = {
  black: "Gloss black",
  bronze: "Bronze",
  silver: "Silver / polished",
}

const CATEGORY_LABELS: Record<string, string> = {
  "off-road": "Off-road",
  luxury: "Luxury",
  street: "Street",
  "truck-dually": "Truck & Dually",
  drag: "Drag",
  utv: "UTV",
}

const formatPrice = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString()}`

const ActiveChips = () => {
  const {
    filters,
    removeArrayFilter,
    setScalarFilter,
    clearAll,
    isAnyFilterActive,
  } = useDiscoveryQuery()

  if (!isAnyFilterActive) return null

  type ChipRow = {
    key: string
    label: string
    onRemove: () => void
  }

  const chips: ChipRow[] = []

  for (const c of filters.categories) {
    chips.push({
      key: `category-${c}`,
      label: CATEGORY_LABELS[c] ?? c,
      onRemove: () => removeArrayFilter("categories", c),
    })
  }
  for (const b of filters.brands) {
    chips.push({
      key: `brand-${b}`,
      label: b,
      onRemove: () => removeArrayFilter("brands", b),
    })
  }
  for (const d of filters.diameters) {
    chips.push({
      key: `diameter-${d}`,
      label: `${d}"`,
      onRemove: () => removeArrayFilter("diameters", d),
    })
  }
  for (const bp of filters.boltPatterns) {
    chips.push({
      key: `bolt-${bp}`,
      label: bp,
      onRemove: () => removeArrayFilter("boltPatterns", bp),
    })
  }
  for (const f of filters.finishes) {
    chips.push({
      key: `finish-${f}`,
      label: FINISH_LABELS[f] ?? f,
      onRemove: () => removeArrayFilter("finishes", f),
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

export default ActiveChips
