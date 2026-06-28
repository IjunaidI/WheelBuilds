"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Icon from "@modules/common/components/icon"
import { useGarage } from "@lib/garage/use-garage"
import { useDiscoveryQuery } from "../../data/use-discovery-query"

const FINISH_LABELS: Record<string, string> = {
  black: "Gloss black",
  bronze: "Bronze",
  silver: "Silver / polished",
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
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const fitActive = active != null && sp.get("fit") !== null && sp.get("fit") !== "0"

  const showAll = () => {
    const n = new URLSearchParams(Array.from(sp.entries()))
    n.set("fit", "0")
    n.delete("page")
    router.replace(`${pathname}?${n.toString()}`)
  }

  if (!isAnyFilterActive && !fitActive) return null

  type ChipRow = {
    key: string
    label: string
    onRemove: () => void
  }

  const chips: ChipRow[] = []

  if (fitActive && active) {
    chips.push({
      key: "fit",
      label: `Fits: ${active.year} ${active.make} ${active.model}`,
      onRemove: showAll,
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
