import { Metadata } from "next"

import DiscoveryTemplate from "@modules/discovery/templates"
import {
  getDiscoveryProducts,
  parseQueryFromSearchParams,
} from "@modules/discovery/data/get-products"

export const metadata: Metadata = {
  title: "All wheels",
  description: "Explore the full Wheel Builds catalog.",
}

type StorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  params: Promise<{ countryCode: string }>
}

/**
 * Discovery (catalog) page. Currently powered by MOCK data — see
 * `modules/discovery/data/get-products.ts` for the integration seam.
 *
 * The legacy `modules/store/` (`StoreTemplate`, `PaginatedProducts`,
 * `RefinementList`) still ships and is the reference for the real
 * Medusa Store API wiring when this page swaps from mock to real.
 */
export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)
  const result = await getDiscoveryProducts(query)

  return <DiscoveryTemplate result={result} currentPage={query.page} />
}
