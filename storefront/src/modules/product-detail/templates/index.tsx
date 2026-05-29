import { DiscoveryProduct } from "@modules/discovery/data/types"
import { ProductDetail } from "../data/types"
import Breadcrumb from "../components/breadcrumb"
import Hero from "../components/hero"
import Specs from "../components/specs"
import Fitment from "../components/fitment"
import Related from "../components/related"

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
}: ProductDetailTemplateProps) => (
  <section
    className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20"
    style={{ maxWidth: 1600, margin: "0 auto" }}
  >
    <div className="mb-6 small:mb-8">
      <Breadcrumb brand={product.brand} name={product.name} />
    </div>
    <Hero product={product} />
    <Specs product={product} />
    <Fitment product={product} />
    <Related products={related} />
  </section>
)

export default ProductDetailTemplate
