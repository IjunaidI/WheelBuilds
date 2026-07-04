"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import Field from "@modules/common/components/field"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import TextInput from "@modules/common/components/text-input"

import { useTireQuery } from "../../use-tire-query"
import { TireFacetCounts, TireType } from "../../data/types"

const TIRE_TYPE_LABELS: Record<TireType, string> = {
  passenger: "Passenger",
  "light-truck": "Light truck",
  other: "Specialty",
}

/**
 * Builds a labelMap that appends a trailing `"` to every rim-diameter facet
 * key for display (e.g. facet key "20" -> label `20"`). Facet keys are
 * data-driven so this can't be a static Record like TIRE_TYPE_LABELS.
 */
const inchLabelMap = (facetMap: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.keys(facetMap).map((k) => [k, `${k}"`]))

/**
 * Reusable checkbox-list section. Sorts by count desc, then alpha. Copied
 * verbatim from modules/discovery/components/filter-rail/filter-sections.tsx
 * — this primitive is field-agnostic and needs no tire-specific changes.
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
  facets: TireFacetCounts
  /** Hides the clear-all button (used inside the mobile drawer which has its own footer). */
  hideClearAll?: boolean
}

/**
 * Vehicle band + filter Accordion + optional Clear button. Reused by the
 * desktop TireFilterRail aside and the mobile filter drawer. Mirrors the wheel
 * FilterSections — the Vehicle band drives size-based tire fitment (the active
 * vehicle's OEM tire sizes are applied as `?fit=` by TireFitmentSync; "Show all
 * tires" opts out with fit=0).
 */
const FilterSections = ({ facets, hideClearAll }: FilterSectionsProps) => {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const {
    filters,
    toggleArrayFilter,
    setScalarFilter,
    clearAll,
    isAnyFilterActive,
  } = useTireQuery()

  const vehicleLabel = active
    ? `${active.year} ${active.make} ${active.model}`
    : "Pick a vehicle for fitment"

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
            Show all tires
          </button>
        ) : null}
      </div>

      <Accordion
        type="multiple"
        defaultValue={["brand", "rim-diameter", "tire-type"]}
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

        <AccordionItem value="rim-diameter">
          <AccordionTrigger>Rim diameter</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.rimDiameters}
              selected={filters.rimDiameters}
              onToggle={(v) => toggleArrayFilter("rimDiameters", v)}
              labelMap={inchLabelMap(facets.rimDiameters)}
              formatKey={(k) => Number(k)}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="size">
          <AccordionTrigger>Size</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.sizes}
              selected={filters.sizes}
              onToggle={(v) => toggleArrayFilter("sizes", v)}
              formatKey={(k) => k}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="tire-type">
          <AccordionTrigger>Tire type</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.tireTypes}
              selected={filters.tireTypes}
              onToggle={(v) => toggleArrayFilter("tireTypes", v)}
              labelMap={TIRE_TYPE_LABELS}
              formatKey={(k) => k}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="speed-rating">
          <AccordionTrigger>Speed rating</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.speedRatings}
              selected={filters.speedRatings}
              onToggle={(v) => toggleArrayFilter("speedRatings", v)}
              formatKey={(k) => k}
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="load-rating">
          <AccordionTrigger>Load rating</AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.loadIndexes}
              selected={filters.loadIndexes}
              onToggle={(v) => toggleArrayFilter("loadIndexes", v)}
              formatKey={(k) => Number(k)}
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
                  placeholder="$300"
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
