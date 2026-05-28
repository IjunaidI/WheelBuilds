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
 * Product Detail (PDP) page. Reads the authoritative product (live price +
 * inventory) from the Medusa Store API via
 * `modules/product-detail/data/get-product.ts`. Unknown handles 404 because
 * the adapter throws `notFound()`, which propagates through both
 * `generateMetadata` and `ProductPage`.
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
