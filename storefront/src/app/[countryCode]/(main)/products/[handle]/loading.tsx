/**
 * Route-level loading fallback for /products/[handle]. Next.js renders this
 * automatically during navigation. Shape matches `<ProductDetailTemplate>`.
 */
import ProductDetailSkeleton from "@modules/product-detail/templates/skeleton"

export default function Loading() {
  return <ProductDetailSkeleton />
}
