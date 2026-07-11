import { MetadataRoute } from "next"
import { getBaseURL } from "@lib/util/env"
import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"

/**
 * WB-082: sitemap for the ~2,700-product catalog. Product handles come from
 * Meilisearch via the SEARCH endpoint (the search-only key has no documents
 * API rights, so this pages an empty-query search — bounded by the index's
 * maxTotalHits=10000, WB-053) rather than hammering the Store API. Meili down
 * → statics only, never a throw. Single-region store: URLs carry the default
 * country code.
 */

const COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"
const PAGE_SIZE = 1000
const SCAN_CAP = 10_000 // index maxTotalHits — the hard ceiling for offset paging

export const revalidate = 86400 // rebuild daily

type SitemapHit = { handle?: string; product_type?: string }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseURL().replace(/\/$/, "")
  const at = (p: string) => `${base}/${COUNTRY}${p}`

  const statics: MetadataRoute.Sitemap = [
    { url: at(""), changeFrequency: "daily", priority: 1 },
    { url: at("/store"), changeFrequency: "daily", priority: 0.9 },
    { url: at("/tires"), changeFrequency: "daily", priority: 0.9 },
    { url: at("/contact"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/returns"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/shipping"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/privacy"), changeFrequency: "yearly", priority: 0.1 },
    { url: at("/terms"), changeFrequency: "yearly", priority: 0.1 },
  ]

  const products: MetadataRoute.Sitemap = []
  try {
    const index = meili.index(PRODUCTS_INDEX)
    for (let offset = 0; offset < SCAN_CAP; offset += PAGE_SIZE) {
      const res = await index.search("", {
        limit: PAGE_SIZE,
        offset,
        attributesToRetrieve: ["handle", "product_type"],
        filter: 'product_type IN ["wheel", "tire"]',
      })
      const hits = res.hits as SitemapHit[]
      for (const h of hits) {
        if (h.handle) {
          products.push({
            url: at(`/products/${h.handle}`),
            changeFrequency: "weekly",
            priority: 0.6,
          })
        }
      }
      if (hits.length < PAGE_SIZE) break
    }
  } catch (e) {
    // Never fail the route over search being down — crawlers still get the statics.
    console.error("[sitemap] Meilisearch unavailable — emitting static URLs only:", e)
  }

  const taxonomy: MetadataRoute.Sitemap = []
  try {
    const { product_categories } = await getCategoriesList(0, 200)
    for (const c of product_categories ?? []) {
      if (c.handle) {
        taxonomy.push({
          url: at(`/categories/${c.handle}`),
          changeFrequency: "weekly",
          priority: 0.5,
        })
      }
    }
  } catch (e) {
    console.error("[sitemap] categories unavailable — skipping:", e)
  }
  try {
    const { collections } = await getCollectionsList(0, 200)
    for (const col of collections ?? []) {
      if (col.handle) {
        taxonomy.push({
          url: at(`/collections/${col.handle}`),
          changeFrequency: "weekly",
          priority: 0.5,
        })
      }
    }
  } catch (e) {
    console.error("[sitemap] collections unavailable — skipping:", e)
  }

  return [...statics, ...taxonomy, ...products]
}
