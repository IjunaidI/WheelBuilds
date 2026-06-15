import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import DiscoveryProductCard from "@modules/discovery/components/grid/product-card"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"

const NewDropsRow = async () => {
  const { newestProducts } = await getHomeCatalog()
  const drops = newestProducts.slice(0, 6)
  if (drops.length === 0) return null

  return (
    <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
      <SectionHeader
        counter="08"
        title="New This Week"
        description="Fresh fitments, first to land — first to ship."
        action={<MicroLink href="/store?sort=newest">View all</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {drops.map((p) => (
          <DiscoveryProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}

export default NewDropsRow
