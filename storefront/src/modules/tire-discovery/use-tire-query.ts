"use client"

/**
 * Client hook for reading + writing the Tire Discovery filter / sort / page
 * state. Mirrors `modules/discovery/data/use-discovery-query.ts` (the wheel
 * hook) with the tire facet vocabulary and no fitment handling.
 *
 * URL search params are the source of truth — the server component re-runs
 * `parseTireQueryFromSearchParams` and re-fetches whenever they change. This
 * hook is purely the write side from interactive client components (filter
 * rail, sort menu, active chips, pagination).
 *
 * When wiring real data, this hook does NOT change — only `get-tire-products.ts`
 * does.
 */

import { useCallback, useMemo } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → filter/sort/pagination changes show the top progress bar
import {
  TireDiscoveryFilters,
  TireDiscoveryQuery,
  EMPTY_TIRE_FILTERS,
  SortOption,
} from "./data/types"
import { parseTireQueryFromSearchParams } from "./data/types"

type ScalarFilterKey = "priceMinCents" | "priceMaxCents"
type ArrayFilterKey = Exclude<keyof TireDiscoveryFilters, ScalarFilterKey>

// URL keys for array filters. Kept identical to the parser in
// data/types.ts (parseTireQueryFromSearchParams) so the round-trip is
// symmetric.
const ARRAY_PARAM: Record<ArrayFilterKey, string> = {
  brands: "brands",
  rimDiameters: "rimDiameters",
  sizes: "sizes",
  tireTypes: "tireTypes",
  speedRatings: "speedRatings",
  loadIndexes: "loadIndexes",
}
const SCALAR_PARAM: Record<ScalarFilterKey, string> = {
  priceMinCents: "priceMin",
  priceMaxCents: "priceMax",
}

const searchParamsToRecord = (
  sp: URLSearchParams
): Record<string, string | string[]> => {
  const out: Record<string, string | string[]> = {}
  sp.forEach((value, key) => {
    const existing = out[key]
    if (existing === undefined) {
      out[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      out[key] = [existing, value]
    }
  })
  return out
}

export const useTireQuery = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const query: TireDiscoveryQuery = useMemo(
    () => parseTireQueryFromSearchParams(searchParamsToRecord(searchParams)),
    [searchParams]
  )

  // Build a fresh URLSearchParams from the current one + a patch. Always
  // resets `page` to 1 unless the patch explicitly sets it — changing any
  // filter should bounce you back to page 1.
  const push = useCallback(
    (patch: (sp: URLSearchParams) => void, opts?: { keepPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString())
      patch(next)
      if (!opts?.keepPage) next.delete("page")
      const qs = next.toString()
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const toggleArrayFilter = useCallback(
    (key: ArrayFilterKey, value: string | number) => {
      push((sp) => {
        const param = ARRAY_PARAM[key]
        const current = sp.getAll(param)
        const str = String(value)
        if (current.includes(str)) {
          sp.delete(param)
          for (const v of current) if (v !== str) sp.append(param, v)
        } else {
          sp.append(param, str)
        }
      })
    },
    [push]
  )

  const removeArrayFilter = useCallback(
    (key: ArrayFilterKey, value: string | number) => {
      push((sp) => {
        const param = ARRAY_PARAM[key]
        const current = sp.getAll(param)
        sp.delete(param)
        for (const v of current) if (v !== String(value)) sp.append(param, v)
      })
    },
    [push]
  )

  const setScalarFilter = useCallback(
    (key: ScalarFilterKey, value: number | undefined) => {
      push((sp) => {
        const param = SCALAR_PARAM[key]
        sp.delete(param)
        if (value != null && Number.isFinite(value)) {
          sp.set(param, String(value))
        }
      })
    },
    [push]
  )

  const setSort = useCallback(
    (sort: SortOption) => {
      push((sp) => {
        if (sort === "relevance") sp.delete("sort")
        else sp.set("sort", sort)
      })
    },
    [push]
  )

  // WB-088 D13 (mirrors the wheel use-discovery-query.ts): scroll to the top
  // of the viewport on page change so the new page's results are visible
  // immediately instead of leaving the shopper at the old scroll offset
  // (often deep in the grid or at the pagination control itself).
  const setPage = useCallback(
    (page: number) => {
      push(
        (sp) => {
          if (page <= 1) sp.delete("page")
          else sp.set("page", String(page))
        },
        { keepPage: true }
      )
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    },
    [push]
  )

  // Route-agnostic: navigates to the current pathname with no search params
  // (rather than hardcoding a route segment) so it works from `/tires` (or
  // wherever this hook is mounted) without drift if the route ever moves.
  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false })
  }, [router, pathname])

  // "Show all" escape (WB-063 T5): sets fit=0, the explicit opt-out that
  // TireFitmentSync treats as authoritative and never overwrites. Mirrors
  // the wheel active-chips `Fits:` chip's `showAll`, centralized here (via
  // `push`, which also resets `page`) instead of inlined in the component.
  const clearFit = useCallback(() => {
    push((sp) => {
      sp.set("fit", "0")
    })
  }, [push])

  return {
    query,
    filters: query.filters,
    sort: query.sort,
    page: query.page,
    q: query.q,
    toggleArrayFilter,
    removeArrayFilter,
    setScalarFilter,
    setSort,
    setPage,
    clearAll,
    clearFit,
    // Helpers
    isAnyFilterActive: hasActiveQueryOrFilter(query.filters, query.q),
  }
}

const hasAnyFilter = (f: TireDiscoveryFilters): boolean => {
  if (f.brands.length) return true
  if (f.rimDiameters.length) return true
  if (f.sizes.length) return true
  if (f.tireTypes.length) return true
  if (f.speedRatings.length) return true
  if (f.loadIndexes.length) return true
  if (f.priceMinCents != null) return true
  if (f.priceMaxCents != null) return true
  return false
}

/**
 * Tire twin of `modules/discovery/data/use-discovery-query.ts`'s
 * `hasActiveQueryOrFilter` (WB-087 D3) — a results page is "active" when
 * either a filter is set OR a free-text search term is present.
 */
export const hasActiveQueryOrFilter = (
  f: TireDiscoveryFilters,
  q: string | undefined
): boolean => hasAnyFilter(f) || !!(q && q.trim())

export { EMPTY_TIRE_FILTERS }
