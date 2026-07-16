import { Suspense } from "react"
import { canonicalUrl } from "@lib/util/canonical"
import { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"
import { TireProductDetail } from "../data/types"
import TireBreadcrumb from "../components/tire/breadcrumb"
import TireHero from "../components/tire/hero"
import TireSpecs from "../components/tire/specs"
import TireFitment from "../components/tire/fitment"
import TireRelated from "../components/tire/related"
import FitmentContextSetter from "@modules/common/components/fitment-context-setter"
import ProductStructuredData from "../components/structured-data"
import { pickDefaultTireLeaf } from "../data/pick-default-leaf"
import { headlinePriceCents } from "../data/price-truth"

type TireDetailTemplateProps = {
  product: TireProductDetail
  related: TireDiscoveryProduct[]
}

/**
 * Tire Product Detail (PDP) layout. Server component — mirrors the wheel
 * ProductDetailTemplate (templates/index.tsx), including the WB-095 Task 5
 * Product + BreadcrumbList JSON-LD (the tire PDP is a real, separate
 * template — see `[handle]/page.tsx`'s `kind === "tire"` branch — so it
 * needs its own structured data, not just the wheel one). The Fitment
 * section now has a tire-specific reverse-fitment equivalent (WB-065). The
 * Hero is the only interactive part (size picks are client state); everything
 * else is server-rendered.
 */
const TireDetailTemplate = ({
  product,
  related,
}: TireDetailTemplateProps) => {
  const productUrl = canonicalUrl(`/products/${product.handle}`)

  // The exact size the tire Hero renders by default (WB-095 Task 5 fix wave,
  // Important 1) — mirrors `pickDefaultLeaf` on the wheel side; see
  // `data/pick-default-leaf.ts`.
  const defaultLeaf = pickDefaultTireLeaf(product)

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
          leaf: defaultLeaf
            ? {
                availability: defaultLeaf.availability,
                priceCents: headlinePriceCents(defaultLeaf.priceCents),
                variantId: defaultLeaf.variantId,
              }
            : null,
        }}
        url={productUrl}
        breadcrumbs={[
          { name: "Home", url: canonicalUrl("/") },
          { name: "Tires", url: canonicalUrl("/tires") },
          {
            name: product.brand,
            url: canonicalUrl(`/tires?brands=${encodeURIComponent(product.brand)}`),
          },
          { name: product.name },
        ]}
      />
      <FitmentContextSetter target="tires" />
      <div className="mb-6 small:mb-8">
        <TireBreadcrumb brand={product.brand} name={product.name} />
      </div>
      <Suspense fallback={<div className="min-h-[600px]" />}>
        <TireHero product={product} />
      </Suspense>
      <TireSpecs product={product} />
      <TireFitment product={product} />
      <TireRelated products={related} />
    </section>
  )
}

export default TireDetailTemplate
