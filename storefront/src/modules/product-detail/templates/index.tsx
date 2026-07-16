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
import { pickDefaultLeaf } from "../data/pick-default-leaf"
import { headlinePriceCents } from "../data/price-truth"

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

  // The exact leaf variant the Hero renders by default (WB-095 Task 5 fix
  // wave, Important 1) — same function the Hero itself now seeds its
  // initial finish/bolt-pattern/size/offset state from (see
  // `components/hero/index.tsx` + `data/pick-default-leaf.ts`), so the
  // structured data's price + availability can never disagree with the
  // page's own default render.
  const defaultLeaf = pickDefaultLeaf(product)
  // Per-finish vendor imagery beyond the thumbnail (Minor 3) — Google
  // prefers multiple images. Deduped; thumbnail-only when a wheel has no
  // finish images at all.
  const images = Array.from(
    new Set(
      [product.thumbnail, ...product.finishOptions.map((f) => f.imageUrl)].filter(
        (u): u is string => !!u
      )
    )
  )

  return (
    <section
      className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20"
      style={{ maxWidth: 1600, margin: "0 auto" }}
    >
      <ProductStructuredData
        product={{
          name: product.name,
          brand: product.brand,
          thumbnail: product.thumbnail,
          description: product.description,
          images,
          leaf: defaultLeaf
            ? {
                availability: defaultLeaf.availability,
                priceCents: headlinePriceCents(defaultLeaf.priceCents),
                sku: defaultLeaf.sku,
              }
            : null,
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
