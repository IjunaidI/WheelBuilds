import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import DiscoveryProductCard from "@modules/discovery/components/grid/product-card"
import { DiscoveryProduct } from "@modules/discovery/data/types"

type RelatedProps = {
  products: DiscoveryProduct[]
}

/**
 * "Similar wheels" row at the bottom of the PDP. Reuses the Discovery
 * product card so both surfaces stay visually identical.
 */
const Related = ({ products }: RelatedProps) => {
  if (products.length === 0) return null

  return (
    <section className="border-t border-[var(--hairline)] py-16 small:py-20">
      <SectionHeader
        eyebrow="ALSO IN YOUR LANE"
        title="Similar wheels"
        action={<MicroLink href="/store">Browse all</MicroLink>}
        marginBottom={32}
      />
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
        {products.slice(0, 4).map((p) => (
          <li key={p.id}>
            <DiscoveryProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Related
