"use client"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Icon from "@modules/common/components/icon"

import { useTireQuery } from "../../use-tire-query"
import { SORT_LABELS, SortOption } from "../../data/types"

type TireHeaderProps = {
  totalCount: number
}

/**
 * Mirrors modules/discovery/components/header — title + result count + sort
 * dropdown — minus the garage / "FITS YOUR {make}" chip. Tires have no
 * fitment constraint, so there's nothing to indicate here.
 */
const TireHeader = ({ totalCount }: TireHeaderProps) => {
  const { sort, setSort } = useTireQuery()

  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-[var(--hairline)] mb-6">
      <div className="flex flex-col small:flex-row small:items-end small:justify-between gap-4">
        <div className="min-w-0">
          <Label tone="muted" style={{ display: "block", marginBottom: 6 }}>
            CATALOG ·{" "}
            {totalCount.toLocaleString()} {totalCount === 1 ? "RESULT" : "RESULTS"}
          </Label>
          <Display size={32} as="h1" className="small:!text-[48px]">
            All tires
          </Display>
        </div>
        <div className="flex items-center gap-2 small:gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="sort" size={14} strokeWidth={1.6} />
                <span className="hidden xsmall:inline">Sort · {SORT_LABELS[sort]}</span>
                <span className="xsmall:hidden">Sort</span>
                <Icon name="chevron-down" size={12} color="#8A8A8E" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(
                ([value, label]) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => setSort(value)}
                    className={
                      sort === value
                        ? "text-[var(--orange)] font-semibold"
                        : ""
                    }
                  >
                    {label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

export default TireHeader
