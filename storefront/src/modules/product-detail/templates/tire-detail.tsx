import { Suspense } from "react"
import { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"
import { TireProductDetail } from "../data/types"
import TireBreadcrumb from "../components/tire/breadcrumb"
import TireHero from "../components/tire/hero"
import TireSpecs from "../components/tire/specs"
import TireFitment from "../components/tire/fitment"
import TireRelated from "../components/tire/related"

type TireDetailTemplateProps = {
  product: TireProductDetail
  related: TireDiscoveryProduct[]
}

/**
 * Tire Product Detail (PDP) layout. Server component — mirrors the wheel
 * ProductDetailTemplate (templates/index.tsx). The Fitment section now has a
 * tire-specific reverse-fitment equivalent (WB-065). The Hero is the only
 * interactive part (size picks are client state); everything else is
 * server-rendered.
 */
const TireDetailTemplate = ({
  product,
  related,
}: TireDetailTemplateProps) => (
  <section
    className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20"
    style={{ maxWidth: 1600, margin: "0 auto" }}
  >
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

export default TireDetailTemplate
