import { Meilisearch } from "meilisearch"

/**
 * Server-side Meilisearch client for the Discovery adapter. Reuses the same
 * env the InstantSearch client uses (search-client.ts). Distinct from that
 * adapter, which exists only for any client-side InstantSearch widgets.
 */
const host =
  process.env.NEXT_PUBLIC_SEARCH_ENDPOINT || "http://127.0.0.1:7700"
const apiKey = process.env.NEXT_PUBLIC_SEARCH_API_KEY || "test_key"

export const meili = new Meilisearch({ host, apiKey })

export const PRODUCTS_INDEX =
  process.env.NEXT_PUBLIC_INDEX_NAME || "products"
