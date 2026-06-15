import SectionHeader from "@modules/common/components/section-header"
import MicroLink from "@modules/common/components/micro-link"
import BrandTile from "@modules/common/components/brand-tile"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"

const ShopByBrand = async () => {
  const { facets } = await getHomeCatalog()
  const brands = Object.entries(facets.brands).sort((a, b) => b[1] - a[1])
  if (brands.length === 0) return null

  return (
    <section
      className="px-5 py-16 xsmall:px-8 small:px-20 small:py-[120px] bg-white"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <SectionHeader
        eyebrow={`${brands.length} BRANDS · ALL AUTHORIZED`}
        title="Trusted Brands"
        action={<MicroLink href="/store">View all brands</MicroLink>}
      />
      <div className="grid grid-cols-2 xsmall:grid-cols-3 small:grid-cols-4 gap-3 small:gap-4">
        {brands.map(([name, count]) => (
          <BrandTile
            key={name}
            name={name}
            count={count}
            href={`/store?brands=${encodeURIComponent(name)}`}
          />
        ))}
      </div>
    </section>
  )
}

export default ShopByBrand
