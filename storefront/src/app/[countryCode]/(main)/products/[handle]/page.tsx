import { Metadata } from "next"

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
  const description =
    product.description ||
    (product.kind === "wheel"
      ? `${product.brand} ${product.name} wheels — sizes, finishes, live fitment check.`
      : product.description)
  // Suffix comes from the root `metadata.title.template` (WB-095 X1) — don't
  // hand-roll "| Wheel Builds" here or it doubles up.
  const title = `${product.brand} ${product.name}`
  // Vendor CDN thumbnail if present; omitting `images` when it's not lets
  // Next fall back to the site-level opengraph-image/twitter-image instead
  // of emitting a broken/empty image entry.
  const images = product.thumbnail ? [product.thumbnail] : undefined
  return {
    title,
    description,
    openGraph: { title, description, images },
    twitter: { card: "summary_large_image", title, description, images },
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
