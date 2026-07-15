import { Suspense } from "react"
import { canonicalUrl } from "@lib/util/canonical"
import { DiscoveryProduct } from "@modules/discovery/data/types"
import { ProductDetail } from "../data/types"
import Breadcrumb from "../components/breadcrumb"
import Hero from "../components/hero"
import Specs from "../components/specs"
import Fitment from "../components/fitment"
import Related from "../components/related"
import ProductStructuredData from "../components/structured-data"
import { wheelSizesForJsonLd } from "../components/structured-data/json-ld"

type ProductDetailTemplateProps = {
  product: ProductDetail
  related: DiscoveryProduct[]
}

/**
 * Product Detail (PDP) layout. Server component — accepts pre-fetched
 * product + related. The Hero is the only interactive part (variant picks
 * are client state); everything else is server-rendered.
 */
const ProductDetailTemplate = ({
  product,
  related,
}: ProductDetailTemplateProps) => {
  // Same absolute, `us`-pinned URL builder as Task 3's `alternates.canonical`
  // (generateMetadata in the page — untouched here; JSON-LD is not metadata).
  const productUrl = canonicalUrl(`/products/${product.handle}`)
  return (
    <section
      className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20"
      style={{ maxWidth: 1600, margin: "0 auto" }}
    >
      <ProductStructuredData
        product={{
          ...product,
          // A size's own price (falls back to the product's own priceCents
          // when unset), never the raw SizeOption/priceCentsOverride shape —
          // see wheelSizesForJsonLd's own doc + purchasablePriceCents (the
          // dead-SKU-price guard, live-verified on performance-replicas-101).
          sizeOptions: wheelSizesForJsonLd(product.sizeOptions, product.priceCents),
        }}
        url={productUrl}
        breadcrumbs={[
          { name: "Home", url: canonicalUrl("/") },
          { name: "Wheels", url: canonicalUrl("/store") },
          {
            name: product.brand,
            url: canonicalUrl(`/store?brands=${encodeURIComponent(product.brand)}`),
          },
          { name: product.name },
        ]}
      />
      <div className="mb-6 small:mb-8">
        <Breadcrumb brand={product.brand} name={product.name} />
      </div>
      <Suspense fallback={<div className="min-h-[600px]" />}>
        <Hero product={product} />
      </Suspense>
      <Specs product={product} />
      <Fitment product={product} />
      <Related products={related} />
    </section>
  )
}

export default ProductDetailTemplate
