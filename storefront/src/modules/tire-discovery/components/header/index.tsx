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
import { useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { openSearch } from "@lib/stores/search-store"
import Icon from "@modules/common/components/icon"

import { useTireQuery } from "../../use-tire-query"
import { FIT_CANDIDATE_CAP, SORT_LABELS, SortOption } from "../../data/types"

type TireHeaderProps = {
  totalCount: number
  /**
   * True when fit mode's candidate cap may have hidden additional matches
   * (WB-088 D7, mirrors the wheel WB-074 D2) — `totalCount` in that case is a
   * count of the capped candidates checked, not a precise catalog total, so
   * it must not be presented as one. The copy below says "candidates", not
   * "matches", so it never claims a precise fit-checked count.
   */
  isCapped?: boolean
}

/**
 * Mirrors modules/discovery/components/header — title + result count + sort
 * dropdown + garage / "FITS YOUR {make}" chip (WB-063 T5). The list is
 * genuinely fit-filtered only when a real `fit` param is applied AND the
 * active vehicle actually has OEM tire sizes — an absent/opted-out fit or a
 * vehicle with no tire-size data both show the full catalog, so the chip
 * must not claim "FITS YOUR CAR" in those states.
 */
const TireHeader = ({ totalCount, isCapped = false }: TireHeaderProps) => {
  const { active } = useGarage()
  const { sort, setSort, q } = useTireQuery()
  const sp = useSearchParams()

  const fitParam = sp.get("fit")
  const isFitted =
    !!active && !!fitParam && fitParam !== "0" && !!active.oemTireSizes?.length

  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-[var(--hairline)] mb-6">
      <div className="flex flex-col small:flex-row small:items-end small:justify-between gap-4">
        <div className="min-w-0">
          <Label tone="muted" style={{ display: "block", marginBottom: 6 }}>
            {isCapped ? (
              <>CATALOG · TOP {FIT_CANDIDATE_CAP.toLocaleString()} CANDIDATES — REFINE TO NARROW</>
            ) : (
              <>
                CATALOG ·{" "}
                {totalCount.toLocaleString()} {totalCount === 1 ? "RESULT" : "RESULTS"}
              </>
            )}
          </Label>
          <Display size={32} as="h1" className="small:!text-[48px]">
            {q ? `Results for "${q}"` : "All tires"}
          </Display>
        </div>
        <div className="flex items-center gap-2 small:gap-3 flex-wrap">
          {/* Garage indicator — only claims a fit when the list is actually fit-filtered */}
          {isFitted ? (
            <Chip variant="accent" dot onClick={openSearch}>
              <span className="truncate max-w-[180px] small:max-w-none">
                FITS YOUR {active.make.toUpperCase()}{" "}
                <span className="hidden xsmall:inline">{active.model.toUpperCase()}</span>
              </span>
            </Chip>
          ) : (
            <Chip variant="outline" onClick={openSearch}>
              <Icon name="garage" size={12} strokeWidth={1.6} /> Select a vehicle
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
                        ? "text-[var(--orange-deep)] font-semibold"
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
