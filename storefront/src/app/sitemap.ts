import { MetadataRoute } from "next"
import { getBaseURL, isFallbackBaseUrl } from "@lib/util/env"
import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { listBrandCollections } from "@lib/data/collections"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { buildBrandTiles } from "@modules/brands/data/brand-tiles"
import { STYLE_DEFS } from "@modules/home/components/shop-by-style/style-map"
import { styleSlug } from "@modules/home/components/shop-by-style/style-slug"

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

type SitemapHit = { handle?: string; product_type?: string; created_at?: string }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rawBase = getBaseURL()
  const base = rawBase.replace(/\/$/, "")
  const at = (p: string) => `${base}/${COUNTRY}${p}`

  const statics: MetadataRoute.Sitemap = [
    { url: at(""), changeFrequency: "daily", priority: 1 },
    { url: at("/store"), changeFrequency: "daily", priority: 0.9 },
    { url: at("/tires"), changeFrequency: "daily", priority: 0.9 },
    // WB-099 Task 5: /brands + /styles landing pages (Tasks 3-4). The
    // /styles/<slug> entries come straight from the curated STYLE_DEFS array
    // (no network dependency, unlike per-brand-handle below) so they're safe
    // to include even in the fallback-base-url branch right below.
    { url: at("/brands"), changeFrequency: "weekly", priority: 0.8 },
    { url: at("/styles"), changeFrequency: "weekly", priority: 0.8 },
    ...STYLE_DEFS.map((def) => ({
      url: at(`/styles/${styleSlug(def.label)}`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    { url: at("/contact"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/returns"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/shipping"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/privacy"), changeFrequency: "yearly", priority: 0.1 },
    { url: at("/terms"), changeFrequency: "yearly", priority: 0.1 },
  ]

  // WB-095 X3: check-env-variables.js now requires NEXT_PUBLIC_BASE_URL, so
  // this branch should be unreachable from a real build. It's a
  // belt-and-braces second layer for any path that calls sitemap() without
  // going through next.config.js's gate (e.g. a direct import/unit test):
  // skip the Meilisearch product scan -- which could otherwise multiply a
  // loopback host across thousands of URLs -- and log loudly so it can't be
  // missed in build/server logs. The 8 static entries above still resolve
  // against the same (fallback) base; there's no other host to build them
  // from, so this caps the blast radius rather than eliminating it outright.
  if (isFallbackBaseUrl(rawBase)) {
    console.error(
      "[sitemap] NEXT_PUBLIC_BASE_URL is unset (falling back to https://localhost:8000) — emitting statics-only and skipping the Meilisearch product scan. Set NEXT_PUBLIC_BASE_URL to fix."
    )
    return statics
  }

  const products: MetadataRoute.Sitemap = []
  try {
    const index = meili.index(PRODUCTS_INDEX)
    for (let offset = 0; offset < SCAN_CAP; offset += PAGE_SIZE) {
      const res = await index.search("", {
        limit: PAGE_SIZE,
        offset,
        attributesToRetrieve: ["handle", "product_type", "created_at"],
        filter: 'product_type IN ["wheel", "tire"]',
      })
      const hits = res.hits as SitemapHit[]
      for (const h of hits) {
        if (!h.handle) {
          continue
        }
        const entry: MetadataRoute.Sitemap[number] = {
          url: at(`/products/${h.handle}`),
          changeFrequency: "weekly",
          priority: 0.6,
        }
        // WB-095 X3: `created_at` IS in the index's displayedAttributes
        // (medusa-config.js's Meili `settings.products.indexSettings`) and
        // confirmed present live for wheel/tire docs -- but stamp it only
        // when the hit actually carries a parseable value. Never fall back
        // to `new Date()`: that would tell crawlers every URL changed on
        // every deploy, which is false.
        if (h.created_at) {
          const created = new Date(h.created_at)
          if (!Number.isNaN(created.getTime())) {
            entry.lastModified = created
          }
        }
        products.push(entry)
      }
      if (hits.length < PAGE_SIZE) break
    }
  } catch (e) {
    // Never fail the route over search being down — crawlers still get the statics.
    console.error("[sitemap] Meilisearch unavailable — emitting static URLs only:", e)
  }

  // WB-099 Task 5: one entry per WHEEL brand landing page. `buildBrandTiles`
  // joins the live wheel-facet count map (getHomeCatalog — product_type =
  // "wheel") with the collection handles, dropping any brand with no wheel
  // count — the SAME source the /brands INDEX renders from, so the sitemap
  // can never advertise a brand page the index doesn't link. This matters:
  // listBrandCollections() is unfiltered (includes ~11 tire-only brands like
  // avix/fuel-tires), and a tire-only /brands/<handle> renders an EMPTY wheel
  // grid (getDiscoveryProducts is hard-scoped to wheels) — indexing those
  // would be thin-content soft-404s. Same fail-open shape as the scan above.
  const brandRoutes: MetadataRoute.Sitemap = []
  try {
    const [{ facets }, collections] = await Promise.all([
      getHomeCatalog(),
      listBrandCollections(),
    ])
    for (const tile of buildBrandTiles(facets.brands, collections)) {
      brandRoutes.push({
        url: at(tile.href), // tile.href is already `/brands/<handle>`
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch (e) {
    console.error(
      "[sitemap] brand catalog unavailable — emitting /brands index only:",
      e
    )
  }

  return [...statics, ...products, ...brandRoutes]
}
