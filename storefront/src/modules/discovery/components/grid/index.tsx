import { DiscoveryProduct } from "../../data/types"
import DiscoveryProductCard from "./product-card"

type DiscoveryGridProps = {
  products: DiscoveryProduct[]
  fit?: boolean
  /** Active diameter filter (WB-088 D5) — threaded down to each card so a
   *  filtered "20-inch" view narrows the chip instead of showing the
   *  product's full diameter range. */
  activeDiameters?: number[]
}

/**
 * 4-up product grid on the discovery / store page. Collapses to 3 on small,
 * 2 on xsmall. Server component — the products array comes from the page's
 * Suspense boundary above.
 */
const DiscoveryGrid = ({ products, fit = false, activeDiameters }: DiscoveryGridProps) => (
  <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
    {products.map((p) => (
      <li key={p.id}>
        <DiscoveryProductCard product={p} fit={fit} activeDiameters={activeDiameters} />
      </li>
    ))}
  </ul>
)

export default DiscoveryGrid
