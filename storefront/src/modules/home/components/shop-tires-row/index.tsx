import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import TireProductCard from "@modules/tire-discovery/components/grid/tire-product-card"
import { getHomeTires } from "@modules/home/data/get-home-tires"

const ShopTiresRow = async () => {
  const tires = await getHomeTires(6)
  if (tires.length === 0) return null

  return (
    <section className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-[120px] small:pb-20">
      <SectionHeader
        counter="09"
        title="Shop Tires"
        description="Grip that matches the build — tires for every fitment."
        action={<MicroLink href="/tires">View all tires</MicroLink>}
      />
      <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
        {tires.map((t) => (
          <TireProductCard key={t.id} product={t} />
        ))}
      </div>
    </section>
  )
}

export default ShopTiresRow
