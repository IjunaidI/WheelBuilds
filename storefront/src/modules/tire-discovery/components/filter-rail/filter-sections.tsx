"use client"

import { useCallback, useEffect, useState } from "react"
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
import { commitPriceRange } from "@modules/discovery/data/price-range"
import { sortFacetEntries } from "@modules/discovery/data/facet-sort"
import { filterFacetKeys } from "./filter-facet-keys"

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
 * Reusable checkbox-list section. Sorts by count desc, then alpha — unless
 * `numeric` (rim diameter, load index), which sorts ascending by
 * `Number(key)` instead (WB-088 D10). Mirrors
 * modules/discovery/components/filter-rail/filter-sections.tsx — this
 * primitive is field-agnostic and needs no tire-specific changes.
 */
const ChecklistSection = <T extends string | number>({
  facetMap,
  selected,
  onToggle,
  labelMap,
  formatKey,
  numeric,
  instanceId,
  sectionId,
}: {
  facetMap: Record<string, number>
  selected: T[]
  onToggle: (value: T) => void
  labelMap?: Record<string, string>
  formatKey: (raw: string) => T
  numeric?: boolean
  /** Distinguishes the desktop rail from the mobile drawer instance of this
   *  section so checkbox ids don't collide when both are mounted at once
   *  (WB-088 X10). */
  instanceId: string
  /** Facet dimension (e.g. "rim"/"load") — combined with `instanceId` so two
   *  numeric sections in the SAME instance can't collide on a shared bare
   *  integer key (WB-088 X10: `rimDiameters` and `loadIndexes` are both
   *  numeric, so e.g. `filter-rail-15` could mint for both). */
  sectionId: string
}) => {
  const entries = sortFacetEntries(facetMap, numeric)

  return (
    <ul className="flex flex-col gap-2 pt-1">
      {entries.map(([key, count]) => {
        const typed = formatKey(key)
        const checked = selected.some((s) => String(s) === key)
        const id = `filter-${instanceId}-${sectionId}-${key}`
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
  /**
   * Distinguishes the desktop rail ("rail") from the mobile drawer ("drawer")
   * instance of this component so the checkbox ids they generate don't
   * collide when both are mounted at once (WB-088 X10). Mirrors the wheel
   * FilterSections prop of the same name.
   */
  instanceId?: string
}

/**
 * Vehicle band + filter Accordion + optional Clear button. Reused by the
 * desktop TireFilterRail aside and the mobile filter drawer. Mirrors the wheel
 * FilterSections — the Vehicle band drives size-based tire fitment (the active
 * vehicle's OEM tire sizes are applied as `?fit=` by TireFitmentSync; "Show all
 * tires" opts out with fit=0).
 */
const FilterSections = ({
  facets,
  hideClearAll,
  instanceId = "rail",
}: FilterSectionsProps) => {
  const { active } = useGarage()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const {
    filters,
    toggleArrayFilter,
    replaceScalars,
    clearAll,
    isAnyFilterActive,
  } = useTireQuery()

  const vehicleLabel = active
    ? `${active.year} ${active.make} ${active.model}`
    : "Pick a vehicle for fitment"

  // WB-088 D8: local (uncommitted) text for the price Min/Max inputs. Kept
  // separate from `filters.priceMinCents`/`priceMaxCents` so keystrokes don't
  // push a URL change — only commit (blur/Enter) does. Re-synced from the
  // URL-derived filters whenever they change externally (Clear all, back/
  // forward nav, or the commit below landing). Mirrors the wheel twin in
  // discovery/components/filter-rail/filter-sections.tsx.
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
  // inputs, then writes both params together via `replaceScalars` — a
  // transient scalar edit, not a `push` — so typing a price range doesn't
  // spam browser history. WB-088 fixwave: routed through the hook's
  // `replaceScalars` (the bprogress router) instead of a local
  // `next/navigation` `router.replace`, so the commit shows the top progress
  // bar like every other filter interaction. Mirrors the wheel twin in
  // discovery/components/filter-rail/filter-sections.tsx.
  const commitPrice = useCallback(() => {
    const { min, max } = commitPriceRange(minInput, maxInput)
    setMinInput(min != null ? String(min) : "")
    setMaxInput(max != null ? String(max) : "")

    replaceScalars({
      priceMinCents: min != null ? Math.round(min * 100) : undefined,
      priceMaxCents: max != null ? Math.round(max * 100) : undefined,
    })
  }, [minInput, maxInput, replaceScalars])

  const onPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commitPrice()
    }
  }

  // WB-088 D9: tire Size is the one facet on this rail with enough distinct
  // values (now up to 500 post maxValuesPerFacet, see medusa-config.js) that
  // a flat checklist is impractical to scan. This is purely a client-side
  // narrowing of the already-loaded `facets.sizes` — it never touches the
  // URL or re-queries Meilisearch, so it doesn't affect which sizes are
  // actually selectable/selected (`filters.sizes`/`toggleArrayFilter`).
  const [sizeQuery, setSizeQuery] = useState("")
  const filteredSizeKeys = filterFacetKeys(Object.keys(facets.sizes), sizeQuery)
  const filteredSizeFacetMap = Object.fromEntries(
    filteredSizeKeys.map((k) => [k, facets.sizes[k]])
  )

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
              instanceId={instanceId}
              sectionId="brand"
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
              numeric
              instanceId={instanceId}
              sectionId="rim"
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="size">
          <AccordionTrigger>Size</AccordionTrigger>
          <AccordionContent>
            <TextInput
              type="text"
              placeholder="Filter sizes (e.g. 225/45R17)"
              aria-label="Filter tire sizes"
              value={sizeQuery}
              onChange={(e) => setSizeQuery(e.target.value)}
              className="mb-2 h-9 text-[13px]"
            />
            {filteredSizeKeys.length === 0 ? (
              <p className="pt-1 text-[12px] text-[var(--ink-soft)]">
                No sizes match &quot;{sizeQuery}&quot;.
              </p>
            ) : (
              <ChecklistSection
                facetMap={filteredSizeFacetMap}
                selected={filters.sizes}
                onToggle={(v) => toggleArrayFilter("sizes", v)}
                formatKey={(k) => k}
                instanceId={instanceId}
                sectionId="size"
              />
            )}
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
              instanceId={instanceId}
              sectionId="type"
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
              instanceId={instanceId}
              sectionId="speed"
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
              numeric
              instanceId={instanceId}
              sectionId="load"
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="price" className="border-b-0">
          <AccordionTrigger>Price</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Field label="Min" htmlFor={`filter-${instanceId}-price-min`}>
                <TextInput
                  id={`filter-${instanceId}-price-min`}
                  type="number"
                  inputMode="numeric"
                  placeholder="$0"
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={onPriceKeyDown}
                />
              </Field>
              <Field label="Max" htmlFor={`filter-${instanceId}-price-max`}>
                <TextInput
                  id={`filter-${instanceId}-price-max`}
                  type="number"
                  inputMode="numeric"
                  placeholder="$300"
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
