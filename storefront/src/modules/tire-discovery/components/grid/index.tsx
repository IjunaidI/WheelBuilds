import { TireDiscoveryProduct } from "../../data/types"
import TireProductCard from "./tire-product-card"

type TireGridProps = {
  products: TireDiscoveryProduct[]
}

/**
 * 4-up product grid on the tire discovery / store page. Collapses to 3 on
 * small, 2 on xsmall. Server component — the products array comes from the
 * page's Suspense boundary above. Mirrors modules/discovery/components/grid,
 * minus fitment (no `fit` prop / no ?fit=1 link).
 */
const TireGrid = ({ products }: TireGridProps) => (
  <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
    {products.map((p) => (
      <li key={p.id}>
        <TireProductCard product={p} />
      </li>
    ))}
  </ul>
)

export default TireGrid
