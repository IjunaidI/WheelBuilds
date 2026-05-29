"use client"

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

const CATEGORY_LABELS: Record<string, string> = {
  "off-road": "Off-road",
  luxury: "Luxury",
  street: "Street",
  "truck-dually": "Truck & Dually",
  drag: "Drag",
  utv: "UTV",
}

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
  const {
    filters,
    toggleArrayFilter,
    setScalarFilter,
    clearAll,
    isAnyFilterActive,
  } = useDiscoveryQuery()

  const vehicleLabel = active
    ? `${active.year} ${active.make} ${active.model}`
    : "Pick a vehicle for fitment"

  // Spec §5 G2: no backend category source in this cut, so the adapter returns
  // an empty `categories` facet. Hide the section entirely rather than render a
  // permanently-empty, dead accordion at the top of the rail.
  const hasCategories = Object.keys(facets.categories).length > 0

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
        {/* TODO(integration): when Phase 2.1 fitment data lands, wire an
            extra "Only show wheels that fit" toggle below this band. */}
      </div>

      <Accordion
        type="multiple"
        defaultValue={["category", "brand", "diameter", "finish"]}
        className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white px-4"
      >
        {hasCategories && (
          <>
            <AccordionItem value="category" className="border-b-0">
              <AccordionTrigger>Category</AccordionTrigger>
              <AccordionContent>
                <ChecklistSection
                  facetMap={facets.categories}
                  selected={filters.categories}
                  onToggle={(v) => toggleArrayFilter("categories", v)}
                  labelMap={CATEGORY_LABELS}
                  formatKey={(k) => k}
                />
              </AccordionContent>
            </AccordionItem>

            <Separator />
          </>
        )}

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
                  value={
                    filters.priceMinCents != null
                      ? Math.round(filters.priceMinCents / 100)
                      : ""
                  }
                  onChange={(e) =>
                    setScalarFilter(
                      "priceMinCents",
                      e.target.value ? Number(e.target.value) * 100 : undefined
                    )
                  }
                />
              </Field>
              <Field label="Max">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  placeholder="$2,500"
                  value={
                    filters.priceMaxCents != null
                      ? Math.round(filters.priceMaxCents / 100)
                      : ""
                  }
                  onChange={(e) =>
                    setScalarFilter(
                      "priceMaxCents",
                      e.target.value ? Number(e.target.value) * 100 : undefined
                    )
                  }
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
