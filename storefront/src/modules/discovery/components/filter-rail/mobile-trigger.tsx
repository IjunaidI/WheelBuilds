"use client"

import { useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import Icon from "@modules/common/components/icon"

import { useDiscoveryQuery } from "../../data/use-discovery-query"
import { FacetCounts } from "../../data/types"
import FilterSections from "./filter-sections"

type MobileFilterTriggerProps = {
  facets: FacetCounts
  totalCount: number
}

/**
 * Mobile filter button + bottom Vaul drawer. Hidden on small+. Pops a sheet
 * from the bottom containing the same FilterSections content the desktop
 * aside uses.
 */
const MobileFilterTrigger = ({
  facets,
  totalCount,
}: MobileFilterTriggerProps) => {
  const [open, setOpen] = useState(false)
  const { filters, isAnyFilterActive, clearAll } = useDiscoveryQuery()

  // Count active filters across all dimensions for the button badge.
  const activeCount =
    filters.brands.length +
    filters.diameters.length +
    filters.boltPatterns.length +
    filters.finishes.length +
    (filters.priceMinCents != null ? 1 : 0) +
    (filters.priceMaxCents != null ? 1 : 0)

  return (
    <div className="small:hidden mb-4">
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <Icon name="filter" size={14} strokeWidth={1.6} />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--orange)] text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </span>
        <span className="text-[11px] font-[var(--mono)] text-[var(--ink-soft)] uppercase tracking-[0.06em]">
          {totalCount} {totalCount === 1 ? "result" : "results"}
        </span>
      </Button>

      <Drawer
        open={open}
        onOpenChange={(next: boolean) => setOpen(next)}
        direction="bottom"
        shouldScaleBackground
      >
        <DrawerContent
          aria-label="Filters"
          className="frame bg-[var(--surface)] max-h-[88vh] flex flex-col"
        >
          <DrawerHandle />
          <DrawerTitle className="sr-only">Filters</DrawerTitle>
          <DrawerDescription className="sr-only">
            Narrow the catalog by category, brand, size, finish, and price.
          </DrawerDescription>

          <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-[var(--hairline)]">
            <span className="font-[var(--display)] font-black text-[18px] uppercase">
              Filters
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
              className="h-8 w-8"
            >
              <Icon name="x" size={18} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <FilterSections facets={facets} hideClearAll />
          </div>

          <div className="flex gap-2 p-4 border-t border-[var(--hairline)] bg-white">
            {isAnyFilterActive && (
              <Button
                variant="outline"
                onClick={() => {
                  clearAll()
                  setOpen(false)
                }}
                className="flex-1"
              >
                Clear all
              </Button>
            )}
            <Button onClick={() => setOpen(false)} className="flex-[2]">
              View {totalCount} {totalCount === 1 ? "result" : "results"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default MobileFilterTrigger
