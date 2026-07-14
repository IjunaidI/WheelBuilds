"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import Field from "@modules/common/components/field"
import TextInput from "@modules/common/components/text-input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"

import { useDiscoveryQuery } from "../../data/use-discovery-query"
import { FacetCounts } from "../../data/types"
import { pcdInchLabel } from "../../data/pcd-inch-label"
import { commitPriceRange } from "../../data/price-range"

const FINISH_LABELS: Record<string, string> = {
  black: "Gloss black",
  bronze: "Bronze",
  silver: "Silver / polished",
}

/**
 * Reusable checkbox-list section. Sorts by count desc, then alpha.
 */
const ChecklistSection = <T extends string | number>({
  facetMap,
  selected,
  onToggle,
  labelMap,
  formatKey,
}: {
  facetMap: Record<string, number>
  selected: T[]
  onToggle: (value: T) => void
  labelMap?: Record<string, string>
  formatKey: (raw: string) => T
}) => {
  const entries = Object.entries(facetMap).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )

  return (
    <ul className="flex flex-col gap-2 pt-1">
      {entries.map(([key, count]) => {
        const typed = formatKey(key)
        const checked = selected.some((s) => String(s) === key)
        const id = `filter-${key}`
        return (
          <li key={key} className="flex items-center gap-2.5">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => onToggle(typed)}
            />
            <label
              htmlFor={id}
              className="flex flex-1 cursor-pointer items-baseline justify-between text-[13px]"
            >
              <span className="text-[var(--ink)]">
                {labelMap?.[key] ?? key}
              </span>
              <span className="text-[11px] text-[var(--ink-soft)] font-[var(--mono)]">
                {count}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

type FilterSectionsProps = {
  facets: FacetCounts
  /** Hides the clear-all button (used inside the mobile drawer which has its own footer). */
  hideClearAll?: boolean
}

/**
 * Vehicle band + filter Accordion + optional Clear button. Reused by the
 * desktop FilterRail aside and the mobile filter drawer.
 */
const FilterSections = ({ facets, hideClearAll }: FilterSectionsProps) => {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const {
    filters,
    toggleArrayFilter,
    clearAll,
    isAnyFilterActive,
  } = useDiscoveryQuery()

  const vehicleLabel = active
    ? `${active.year} ${active.make} ${active.model}`
    : "Pick a vehicle for fitment"

  // WB-088 D4: facets.boltPatterns now carries canonical keys
  // ("{count}x{pcd_mm}") — map each to its dual-unit ("5×114.3 (5×4.5″)")
  // label so one physical pattern renders as one clear checkbox.
  const boltPatternLabels = Object.fromEntries(
    Object.keys(facets.boltPatterns).map((k) => [k, pcdInchLabel(k)])
  )

  // WB-088 D8: local (uncommitted) text for the price Min/Max inputs. Kept
  // separate from `filters.priceMinCents`/`priceMaxCents` so keystrokes don't
  // push a URL change — only commit (blur/Enter) does. Re-synced from the
  // URL-derived filters whenever they change externally (Clear all, back/
  // forward nav, or the commit below landing).
  const [minInput, setMinInput] = useState(
    filters.priceMinCents != null
      ? String(Math.round(filters.priceMinCents / 100))
      : ""
  )
  const [maxInput, setMaxInput] = useState(
    filters.priceMaxCents != null
      ? String(Math.round(filters.priceMaxCents / 100))
      : ""
  )

  useEffect(() => {
    setMinInput(
      filters.priceMinCents != null
        ? String(Math.round(filters.priceMinCents / 100))
        : ""
    )
  }, [filters.priceMinCents])

  useEffect(() => {
    setMaxInput(
      filters.priceMaxCents != null
        ? String(Math.round(filters.priceMaxCents / 100))
        : ""
    )
  }, [filters.priceMaxCents])

  // Commit-on-blur/Enter (not per-keystroke `push`): parses + clamps/swaps
  // via `commitPriceRange`, reflects the coherent pair back into the local
  // inputs, then writes both params together with `router.replace` — a
  // transient scalar edit, not a `push` — so typing a price range doesn't
  // spam browser history.
  const commitPrice = useCallback(() => {
    const { min, max } = commitPriceRange(minInput, maxInput)
    setMinInput(min != null ? String(min) : "")
    setMaxInput(max != null ? String(max) : "")

    const next = new URLSearchParams(Array.from(sp.entries()))
    if (min != null) next.set("priceMin", String(Math.round(min * 100)))
    else next.delete("priceMin")
    if (max != null) next.set("priceMax", String(Math.round(max * 100)))
    else next.delete("priceMax")
    next.delete("page")
    const qs = next.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }, [minInput, maxInput, sp, pathname, router])

  const onPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commitPrice()
    }
  }

  return (
    <>
      <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white p-4 mb-4">
        <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
          Vehicle
        </Label>
        <button
          type="button"
          onClick={openSearch}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ background: active ? "var(--orange)" : "var(--ink-soft)" }}
          />
          <span className="flex-1 text-[13px] font-semibold text-[var(--ink)] truncate">
            {vehicleLabel}
          </span>
          <Icon name="chevron-down" size={14} color="#8A8A8E" />
        </button>
        {active && sp.get("fit") !== "0" ? (
          <button
            type="button"
            className="mt-2 text-[12px] text-[var(--ink-soft)] underline"
            onClick={() => {
              const n = new URLSearchParams(Array.from(sp.entries()))
              n.set("fit", "0")
              n.delete("page")
              router.replace(`${pathname}?${n.toString()}`)
            }}
          >
            Show all wheels
          </button>
        ) : null}
      </div>

      <Accordion
        type="multiple"
        defaultValue={["brand", "diameter", "finish"]}
        className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white px-4"
      >
        <AccordionItem value="brand">
          <AccordionTrigger>Brand</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.brands}
              selected={filters.brands}
              onToggle={(v) => toggleArrayFilter("brands", v)}
              formatKey={(k) => k}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="diameter">
          <AccordionTrigger>Diameter</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.diameters}
              selected={filters.diameters}
              onToggle={(v) => toggleArrayFilter("diameters", v)}
              formatKey={(k) => Number(k)}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="bolt-pattern">
          <AccordionTrigger>Bolt pattern</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.boltPatterns}
              selected={filters.boltPatterns}
              onToggle={(v) => toggleArrayFilter("boltPatterns", v)}
              labelMap={boltPatternLabels}
              formatKey={(k) => k}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="finish">
          <AccordionTrigger>Finish</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.finishes}
              selected={filters.finishes}
              onToggle={(v) => toggleArrayFilter("finishes", v as any)}
              labelMap={FINISH_LABELS}
              formatKey={(k) => k as any}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="price" className="border-b-0">
          <AccordionTrigger>Price</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Field label="Min">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  placeholder="$0"
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={onPriceKeyDown}
                />
              </Field>
              <Field label="Max">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  placeholder="$2,500"
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={onPriceKeyDown}
                />
              </Field>
            </div>
            {/* TODO(integration): replace the two TextInputs with a
                <Slider value={[min, max]}/> (shadcn primitive — install with
                `npx shadcn@2.1.8 add slider`) once a real min/max range
                comes from Meilisearch's price aggregation. */}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {isAnyFilterActive && !hideClearAll && (
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="w-full mt-4"
        >
          Clear all filters
        </Button>
      )}
    </>
  )
}

export default FilterSections
