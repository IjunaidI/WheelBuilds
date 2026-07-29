"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import Icon from "@modules/common/components/icon"
import Label from "@modules/common/components/label"
import FacetCount from "@modules/common/components/facet-count"
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
import { sortFacetEntries } from "../../data/facet-sort"

const FINISH_LABELS: Record<string, string> = {
  black: "Gloss black",
  bronze: "Bronze",
  silver: "Silver / polished",
}

/**
 * Builds a labelMap that appends a trailing `"` to every diameter facet key
 * for display (e.g. facet key "18" -> label `18"`) — WB-088 D10, ported from
 * the tire rail's `inchLabelMap` (tire-discovery/components/filter-rail/
 * filter-sections.tsx). Facet keys are data-driven so this can't be a static
 * Record.
 */
const inchLabelMap = (facetMap: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.keys(facetMap).map((k) => [k, `${k}"`]))

/**
 * Reusable checkbox-list section. Sorts by count desc, then alpha — unless
 * `numeric` (diameter, etc.), which sorts ascending by `Number(key)` instead
 * (WB-088 D10; see `sortFacetEntries`'s docstring for why numeric facets
 * can't use the count-first sort).
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
  /** Facet dimension (e.g. "brand"/"diameter") — combined with `instanceId`
   *  so two numeric sections in the SAME instance can't collide on a shared
   *  bare integer key (WB-088 X10, e.g. tire `rimDiameters` vs
   *  `loadIndexes` both minting id `filter-rail-15`). */
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
  facets: FacetCounts
  /**
   * Real catalog price range in whole dollars (WB-120 Q-15). `null`/absent
   * keeps the previous static placeholders rather than showing a fabricated
   * bound — a wrong hint would suggest products exist outside the range.
   */
  priceBounds?: { minUsd: number; maxUsd: number } | null
  /** Hides the clear-all button (used inside the mobile drawer which has its own footer). */
  hideClearAll?: boolean
  /**
   * Distinguishes the desktop rail ("rail") from the mobile drawer ("drawer")
   * instance of this component so the checkbox ids they generate don't
   * collide when both are mounted at once (WB-088 X10) — the desktop rail is
   * `hidden small:block` (not unmounted) while the mobile drawer is open, so
   * duplicate `id`/`htmlFor` pairs used to exist in the DOM simultaneously.
   */
  instanceId?: string
  /**
   * WB-099 Task 1: omits the Brand accordion section entirely. Used by a
   * server-pinned brand page (e.g. `/brands/fuel`) where a shopper shouldn't
   * be able to uncheck the pinned brand or add a second one. Defaults to
   * `false` so `/store` (which lets shoppers pick any brand) is unchanged.
   */
  hideBrand?: boolean
}

/**
 * Vehicle band + filter Accordion + optional Clear button. Reused by the
 * desktop FilterRail aside and the mobile filter drawer.
 */
const FilterSections = ({
  facets,
  priceBounds,
  hideClearAll,
  instanceId = "rail",
  hideBrand = false,
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
  // inputs, then writes both params together via `replaceScalars` — a
  // transient scalar edit, not a `push` — so typing a price range doesn't
  // spam browser history. WB-088 fixwave: routed through the hook's
  // `replaceScalars` (the bprogress router) instead of a local
  // `next/navigation` `router.replace`, so the commit shows the top progress
  // bar like every other filter interaction.
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

      {/* WB-100: single scalar toggle (not a ChecklistSection — there's no
          per-value distribution to check off), bound to filters.inStockOnly
          via the same replaceScalars path the price inputs commit through.
          Default off (unchecked). */}
      <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white p-4 mb-4 flex items-center gap-2.5">
        <Checkbox
          id={`filter-${instanceId}-in-stock-only`}
          checked={!!filters.inStockOnly}
          onCheckedChange={(checked) =>
            replaceScalars({ inStockOnly: checked === true ? true : undefined })
          }
        />
        <label
          htmlFor={`filter-${instanceId}-in-stock-only`}
          className="text-[13px] font-semibold text-[var(--ink)] cursor-pointer select-none"
        >
          In stock only
        </label>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["brand", "diameter", "bolt-pattern", "finish"]}
        className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white px-4"
      >
        {!hideBrand && (
          <>
            <AccordionItem value="brand">
              <AccordionTrigger>
                Brand
                <FacetCount count={Object.keys(facets.brands ?? {}).length} />
              </AccordionTrigger>
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
          </>
        )}

        <AccordionItem value="diameter">
          <AccordionTrigger>
                Diameter
                <FacetCount count={Object.keys(facets.diameters ?? {}).length} />
              </AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.diameters}
              selected={filters.diameters}
              onToggle={(v) => toggleArrayFilter("diameters", v)}
              labelMap={inchLabelMap(facets.diameters)}
              formatKey={(k) => Number(k)}
              numeric
              instanceId={instanceId}
              sectionId="diameter"
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="bolt-pattern">
          <AccordionTrigger>
                Bolt pattern
                <FacetCount count={Object.keys(facets.boltPatterns ?? {}).length} />
              </AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.boltPatterns}
              selected={filters.boltPatterns}
              onToggle={(v) => toggleArrayFilter("boltPatterns", v)}
              labelMap={boltPatternLabels}
              formatKey={(k) => k}
              instanceId={instanceId}
              sectionId="bolt-pattern"
            />
          </AccordionContent>
        </AccordionItem>

        <Separator />

        <AccordionItem value="finish">
          <AccordionTrigger>
                Finish
                <FacetCount count={Object.keys(facets.finishes ?? {}).length} />
              </AccordionTrigger>
          <AccordionContent>
            <ChecklistSection
              facetMap={facets.finishes}
              selected={filters.finishes}
              onToggle={(v) => toggleArrayFilter("finishes", v as any)}
              labelMap={FINISH_LABELS}
              formatKey={(k) => k as any}
              instanceId={instanceId}
              sectionId="finish"
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
                  placeholder={priceBounds ? `$${priceBounds.minUsd}` : "$0"}
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
                  placeholder={priceBounds ? `$${priceBounds.maxUsd.toLocaleString()}` : "$2,500"}
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={onPriceKeyDown}
                />
              </Field>
            </div>
            {/* WB-120 Q-15: the real min/max now comes from Meilisearch
                `facetStats` and drives the placeholders above. The remaining
                half of the old TODO — swapping these inputs for a
                <Slider value={[min, max]}/> (shadcn, `npx shadcn@2.1.8 add
                slider`) — is split out rather than bundled here, because it
                needs a new Radix dependency and pnpm is not reliably on PATH
                on Windows (see storefront/CLAUDE.md). Bounds are the
                substance; the slider is presentation. */}
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
