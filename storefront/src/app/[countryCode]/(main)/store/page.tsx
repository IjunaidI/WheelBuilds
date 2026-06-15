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
 * Discovery (catalog) page. Live data via the Meilisearch Discovery adapter
 * (getDiscoveryProducts) — see `modules/discovery/data/get-products.ts`.
 *
 * The legacy `modules/store/` (`StoreTemplate`, `PaginatedProducts`,
 * `RefinementList`) is retained because other routes (categories, collections)
 * still import from it.
 */
export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)
  const result = await getDiscoveryProducts(query)

  return <DiscoveryTemplate result={result} currentPage={query.page} />
}
