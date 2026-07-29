import "server-only"

import { meili, PRODUCTS_INDEX } from "@lib/meilisearch"
import { STYLE_DEFS } from "@modules/home/components/shop-by-style/style-map"
import { styleFilterClause } from "@modules/home/components/shop-by-style/style-filter"

/**
 * The DISTINCT number of wheels matching each `STYLE_DEFS` preset, keyed by
 * label (WB-120 Q-12).
 *
 * Replaces summing facet buckets, which double-counted every product
 * appearing under more than one value of a multi-valued facet — STREET
 * advertised 1550 against a listing of 1076. Verified against the live index:
 * this query returns 1076 for that preset, exactly matching the listing.
 *
 * One batched `multiSearch`, so all six counts cost a single round trip. It
 * runs inside `getHomeCatalog`'s `react.cache`, which itself sits behind the
 * WB-021 `unstable_cache` (tag `discovery`, 60s) — so the added cost is one
 * batched request per cache period, not per request.
 *
 * `hitsPerPage`/`page` rather than `limit`/`offset` is load-bearing:
 * Meilisearch only computes the EXHAUSTIVE `totalHits` for that pagination
 * style, and returns an approximate `estimatedTotalHits` for the other
 * (WB-088 D13). An approximate count is precisely the bug being fixed here.
 *
 * Degrades to `{}` on any failure, matching `getDiscoveryProducts`' swallow —
 * `styleTiles` then falls back to its summed counts, so a Meilisearch outage
 * yields inaccurate tiles rather than a blank homepage section.
 */
export async function getStyleCounts(): Promise<Record<string, number>> {
  try {
    const { results } = await meili.multiSearch({
      queries: STYLE_DEFS.map((def) => ({
        indexUid: PRODUCTS_INDEX,
        q: "",
        filter: `product_type = "wheel" AND ${styleFilterClause(def)}`,
        hitsPerPage: 1,
        page: 1,
      })),
    })

    const counts: Record<string, number> = {}
    STYLE_DEFS.forEach((def, i) => {
      const r = results[i] as
        | { totalHits?: number; estimatedTotalHits?: number }
        | undefined
      const total = r?.totalHits ?? r?.estimatedTotalHits
      if (typeof total === "number") counts[def.label] = total
    })
    return counts
  } catch (err) {
    // Degrade to `styleTiles`' summed fallback rather than blanking the
    // section — but say so. This swallow was originally silent, and it hid a
    // real bug all the way into production: `styleFilterClause` emitted
    // `brands = …` where the index attribute is `brand`, Meilisearch rejected
    // the whole ATOMIC multiSearch, and every style quietly reverted to the
    // double-counted numbers this function exists to replace. Nothing in the
    // logs said so. Same lesson as WB-119's subscribers: a swallow that says
    // nothing is indistinguishable from success.
    // eslint-disable-next-line no-console
    console.error(
      `[getStyleCounts] falling back to summed facet counts — style tiles will over-count: ${
        (err as Error)?.message ?? err
      }`
    )
    return {}
  }
}
