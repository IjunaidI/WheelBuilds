import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import TireProductCard from "@modules/tire-discovery/components/grid/tire-product-card"
import { TireDiscoveryProduct } from "@modules/tire-discovery/data/types"

type TireRelatedProps = {
  products: TireDiscoveryProduct[]
}

/**
 * "Similar tires" row at the bottom of the tire PDP. Mirrors the wheel
 * <Related> shell (components/related/index.tsx), reusing the tire-discovery
 * product card so both surfaces stay visually identical.
 */
const TireRelated = ({ products }: TireRelatedProps) => {
  if (products.length === 0) return null

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow="ALSO IN YOUR LANE"
        title="Similar tires"
        action={<MicroLink href="/tires">Browse all</MicroLink>}
        marginBottom={32}
      />
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
        {products.slice(0, 4).map((p) => (
          <li key={p.id}>
            <TireProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default TireRelated
