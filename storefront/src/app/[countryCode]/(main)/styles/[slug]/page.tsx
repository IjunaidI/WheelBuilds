import { Metadata } from "next"
import { notFound } from "next/navigation"

import { canonicalUrl } from "@lib/util/canonical"
import DiscoveryTemplate from "@modules/discovery/templates"
import {
  getDiscoveryProducts,
  parseQueryFromSearchParams,
} from "@modules/discovery/data/get-products"
import { applyStylePreset } from "@modules/home/components/shop-by-style/apply-style-preset"
import { styleFromSlug } from "@modules/home/components/shop-by-style/style-slug"
import StylesHero from "@modules/styles/components/hero"

type Props = {
  params: Promise<{ countryCode: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/styles/[slug]` (WB-099 Task 4) — a style-PRESET Discovery page. `slug` is
 * resolved against the curated `STYLE_DEFS` array (a filter preset — NOT a
 * real Meilisearch facet or backend lookup, see `style-map.ts`'s module doc
 * comment) via `styleFromSlug` (`shop-by-style/style-slug.ts`), which
 * kebab-cases each `STYLE_DEFS.label` and matches by exact equality.
 *
 * `notFound()` (thrown inside both `generateMetadata` and the page below on
 * an unresolved slug) propagates the same way the brand page's does —
 * mirrors the PDP pattern (`products/[handle]/page.tsx`).
 *
 * Unlike `/brands/[slug]` (a LOCK — `hideBrand` removes the Brand section so
 * a shopper can't unpin or add a second brand), a style is a PRESET: the
 * full rail stays (no `hideBrand`-equivalent here), because a style is a
 * curated shortcut into the SAME catalog, not a separate identity — a
 * shopper can freely use every other facet dimension to narrow further,
 * INCLUDING `def.param`'s own facet section (fix wave, WB-099 Task 4). The
 * preset is applied via `applyStylePreset` (`shop-by-style/apply-style-preset.ts`)
 * as a DEFAULT that fills `def.param`'s dimension only when the parsed URL
 * left it empty — not an unconditional override — so a shopper who toggles a
 * checkbox in that SAME dimension (e.g. unchecking "18" on `/styles/street`)
 * genuinely narrows the results instead of the pin silently reasserting the
 * full preset on every render.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const def = styleFromSlug(slug)
  if (!def) {
    notFound()
  }

  const title = def.label
  const description = `Shop the ${def.label} wheel style — curated by size, finish, and fitment, with live inventory.`
  return {
    title,
    description,
    // WB-095 X2: absolute, us-pinned regardless of the country code this
    // request happened to resolve to (WB-071 F-D single-region lock).
    alternates: { canonical: canonicalUrl(`/styles/${slug}`) },
  }
}

export default async function StylePage({ params, searchParams }: Props) {
  const { slug } = await params
  const def = styleFromSlug(slug)
  if (!def) {
    notFound()
  }

  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)

  // The preset default (fill-if-empty, not an override — see the module doc
  // comment above and `applyStylePreset`'s own doc comment). STYLE_DEFS
  // values are always strings; DiscoveryFilters wants `diameters` as
  // number[] (Meili's `diameters` facet is numeric) — brands/finishes pass
  // the strings straight through. That type coercion still happens inside
  // `applyStylePreset`; only the apply-condition changed here.
  query.filters = applyStylePreset(query.filters, def)

  const result = await getDiscoveryProducts(query)
  const inFitMode = !!query.vehicleConstraint?.length

  return (
    <>
      <StylesHero
        eyebrow={`STYLE · ${result.totalCount.toLocaleString()} ${
          result.totalCount === 1 ? "RESULT" : "RESULTS"
        }`}
        title={def.label}
      />
      <DiscoveryTemplate
        result={result}
        currentPage={query.page}
        fit={inFitMode}
        activeDiameters={query.filters.diameters}
      />
    </>
  )
}
