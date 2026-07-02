import { Metadata } from "next"

import { getTireDiscoveryProducts } from "@modules/tire-discovery/data/get-tire-products"
import { parseTireQueryFromSearchParams } from "@modules/tire-discovery/data/types"
import TireDiscoveryTemplate from "@modules/tire-discovery/templates"

export const metadata: Metadata = {
  title: "All tires",
  description: "Explore the full Wheel Builds tire catalog.",
}

type TiresPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Tire discovery (catalog) page. Live data via the Meilisearch tire-discovery
 * adapter (getTireDiscoveryProducts) — see
 * `modules/tire-discovery/data/get-tire-products.ts`. Mirrors the wheel
 * `/store` route shape; no fitment/vehicleConstraint branch (Spec 2 scope
 * for the vehicle-fit seam is wheels only).
 */
export default async function TiresPage({ searchParams }: TiresPageProps) {
  const sp = await searchParams
  const query = parseTireQueryFromSearchParams(sp)
  const result = await getTireDiscoveryProducts(query)

  return <TireDiscoveryTemplate result={result} currentPage={query.page} />
}
