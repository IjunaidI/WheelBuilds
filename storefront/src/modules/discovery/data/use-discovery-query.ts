"use client"

/**
 * Client hook for reading + writing the Discovery filter / sort / page state.
 *
 * URL search params are the source of truth — the server component re-runs
 * `parseQueryFromSearchParams` and re-fetches whenever they change. This hook
 * is purely the write side from interactive client components (FilterRail,
 * SortMenu, ActiveChips, Pagination).
 *
 * When wiring real data, this hook does NOT change — only `get-products.ts`
 * does.
 */

import { useCallback, useMemo } from "react"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { useRouter } from "@bprogress/next/app" // bprogress router → filter/sort/pagination changes show the top progress bar
import {
  DiscoveryFilters,
  DiscoveryQuery,
  EMPTY_FILTERS,
  SortOption,
} from "./types"
import { parseQueryFromSearchParams } from "./types"

type ScalarFilterKey = "priceMinCents" | "priceMaxCents"
type ArrayFilterKey = Exclude<keyof DiscoveryFilters, ScalarFilterKey>

// URL keys for array filters. Kept identical to the parser in get-products.ts
// so the round-trip is symmetric.
const ARRAY_PARAM: Record<ArrayFilterKey, string> = {
  brands: "brands",
  diameters: "diameters",
  boltPatterns: "boltPatterns",
  finishes: "finishes",
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

export const useDiscoveryQuery = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { countryCode } = useParams() as { countryCode: string }

  const query: DiscoveryQuery = useMemo(
    () => parseQueryFromSearchParams(searchParamsToRecord(searchParams)),
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

  const setPage = useCallback(
    (page: number) => {
      push(
        (sp) => {
          if (page <= 1) sp.delete("page")
          else sp.set("page", String(page))
        },
        { keepPage: true }
      )
    },
    [push]
  )

  const clearAll = useCallback(() => {
    router.push(`/${countryCode}/store`, { scroll: false })
  }, [router, countryCode])

  return {
    query,
    filters: query.filters,
    sort: query.sort,
    page: query.page,
    toggleArrayFilter,
    removeArrayFilter,
    setScalarFilter,
    setSort,
    setPage,
    clearAll,
    // Helpers
    isAnyFilterActive: hasAnyFilter(query.filters),
  }
}

const hasAnyFilter = (f: DiscoveryFilters): boolean => {
  if (f.brands.length) return true
  if (f.diameters.length) return true
  if (f.boltPatterns.length) return true
  if (f.finishes.length) return true
  if (f.priceMinCents != null) return true
  if (f.priceMaxCents != null) return true
  return false
}

export { EMPTY_FILTERS }
