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
    style={{
      padding: "32px 80px 80px",
      maxWidth: 1600,
      margin: "0 auto",
    }}
  >
    <div style={{ marginBottom: 32 }}>
      <Breadcrumb brand={product.brand} name={product.name} />
    </div>
    <Hero product={product} />
    <Specs product={product} />
    <Fitment product={product} />
    <Related products={related} />
  </section>
)

export default ProductDetailTemplate
