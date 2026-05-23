"use client"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import Chip from "@modules/common/components/chip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import Icon from "@modules/common/components/icon"

import { useDiscoveryQuery } from "../../data/use-discovery-query"
import { SORT_LABELS, SortOption } from "../../data/types"

type DiscoveryHeaderProps = {
  totalCount: number
}

const DiscoveryHeader = ({ totalCount }: DiscoveryHeaderProps) => {
  const { active } = useGarage()
  const { sort, setSort } = useDiscoveryQuery()

  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-[var(--hairline)] mb-6">
      <div className="flex flex-col small:flex-row small:items-end small:justify-between gap-4">
        <div className="min-w-0">
          <Label tone="muted" style={{ display: "block", marginBottom: 6 }}>
            CATALOG ·{" "}
            {totalCount.toLocaleString()} {totalCount === 1 ? "RESULT" : "RESULTS"}
          </Label>
          <Display size={32} as="h1" className="small:!text-[48px]">
            All wheels
          </Display>
        </div>
        <div className="flex items-center gap-2 small:gap-3 flex-wrap">
          {/* Garage indicator — appears when an active vehicle is set */}
          {active ? (
            <Chip variant="accent" dot onClick={openSearch}>
              <span className="truncate max-w-[180px] small:max-w-none">
                FITS YOUR {active.make.toUpperCase()}{" "}
                <span className="hidden xsmall:inline">{active.model.toUpperCase()}</span>
              </span>
            </Chip>
          ) : (
            <Chip variant="outline" onClick={openSearch}>
              <Icon name="garage" size={12} strokeWidth={1.6} /> Pick a vehicle
            </Chip>
          )}

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

export default DiscoveryHeader
