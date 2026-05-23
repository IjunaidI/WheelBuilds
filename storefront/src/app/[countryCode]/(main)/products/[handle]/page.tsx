import { Metadata } from "next"

import ProductDetailTemplate from "@modules/product-detail/templates"
import {
  getProductDetail,
  getRelatedProducts,
} from "@modules/product-detail/data/get-product"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

/**
 * Product Detail (PDP) page. Currently powered by MOCK data — every handle
 * resolves to the same dummy product. See
 * `modules/product-detail/data/get-product.ts` for the integration seam.
 *
 * The legacy `modules/products/` (`ProductTemplate`) and the
 * `getProductByHandle` / `getRegion` / `generateStaticParams` flows still
 * ship in the repo and are the reference for the real Medusa wiring. Once
 * the swap lands, restore `generateStaticParams` and `notFound()` for
 * missing handles.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const product = await getProductDetail(handle)
  return {
    title: `${product.brand} ${product.name} | Wheel Builds`,
    description: product.description,
  }
}

export default async function ProductPage({ params }: Props) {
  const { handle } = await params
  const product = await getProductDetail(handle)
  const related = await getRelatedProducts(product)

  return <ProductDetailTemplate product={product} related={related} />
}
