import { Metadata } from "next"

import { canonicalUrl } from "@lib/util/canonical"
import ProductDetailTemplate from "@modules/product-detail/templates"
import TireDetailTemplate from "@modules/product-detail/templates/tire-detail"
import {
  getProductDetail,
  getRelatedProducts,
  getRelatedTireProducts,
} from "@modules/product-detail/data/get-product"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

/**
 * Product Detail (PDP) page. Reads the authoritative product (live price +
 * inventory) from the Medusa Store API via
 * `modules/product-detail/data/get-product.ts`. Unknown handles 404 because
 * the adapter throws `notFound()`, which propagates through both
 * `generateMetadata` and `ProductPage`.
 *
 * Branches on `product.kind`: tires render `TireDetailTemplate` with related
 * tires from the same brand (via Meili tire discovery); wheels render the
 * existing `ProductDetailTemplate` with related wheels from the same brand
 * collection. The `kind === "tire"` check narrows `AnyProductDetail` so the
 * wheel-only branch below type-checks as plain `ProductDetail`.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, countryCode } = await params
  const product = await getProductDetail(handle, countryCode)
  // WB-090 P10: an empty vendor description used to ship an empty <meta
  // name="description">. Wheel-only templated fallback (tires aren't in
  // scope for this fix); a wheel with a real description is unaffected.
  // `product.name` already begins with the brand (see buildGroupTitle /
  // buildTireGroupTitle in vendor-sync, and retitle-wheels.ts's backfill) —
  // prepending `product.brand` again here doubled it, e.g. "American Force
  // Cast American Force Cast 004". Verified live: 100% of sampled wheel +
  // tire products' titles already start with metadata.brand.
  const description =
    product.description ||
    (product.kind === "wheel"
      ? `${product.name} wheels — sizes, finishes, live fitment check.`
      : product.description)
  // Suffix comes from the root `metadata.title.template` (WB-095 X1) — don't
  // hand-roll "| Wheel Builds" here or it doubles up.
  const title = product.name
  // Vendor CDN thumbnail if present. When absent, the `images` key must be
  // OMITTED (not set to `undefined`) — Next's static-file fallback only
  // engages via `!source.openGraph.hasOwnProperty('images')`
  // (node_modules/next/dist/lib/metadata/resolve-metadata.js), and the
  // `{ images }` shorthand sets that key to `undefined` while still leaving
  // it present, which skips the fallback and emits no og:image at all.
  const images = product.thumbnail ? [product.thumbnail] : undefined
  return {
    title,
    description,
    openGraph: { title, description, ...(images ? { images } : {}) },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images } : {}),
    },
    // WB-095 X2: pinned to DEFAULT_REGION regardless of the country code
    // this request happened to resolve to (WB-071 F-D single-region lock).
    // `handle` is region-agnostic, so the same product's canonical is
    // identical no matter which /<countryCode>/products/<handle> served it.
    alternates: { canonical: canonicalUrl(`/products/${handle}`) },
  }
}

export default async function ProductPage({ params }: Props) {
  const { handle, countryCode } = await params
  const product = await getProductDetail(handle, countryCode)

  if (product.kind === "tire") {
    const related = await getRelatedTireProducts(product.brand, product.handle)
    return <TireDetailTemplate product={product} related={related} />
  }

  const related = await getRelatedProducts(product, countryCode)
  return <ProductDetailTemplate product={product} related={related} />
}
