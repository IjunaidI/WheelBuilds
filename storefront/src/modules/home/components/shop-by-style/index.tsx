import Display from "@modules/common/components/display"
import CategoryTile from "@modules/common/components/category-tile"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { styleTiles } from "./style-map"

const ShopByStyle = async () => {
  const { facets } = await getHomeCatalog()
  const tiles = styleTiles(facets)
  if (tiles.length === 0) return null

  return (
    <section className="px-5 pb-16 xsmall:px-8 small:px-20 small:pb-[120px]">
      <Display size={32} className="mb-6 small:!text-[40px] small:mb-8">
        Shop by Style
      </Display>
      <div className="grid grid-cols-2 small:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <CategoryTile
            key={t.label}
            label={t.label}
            href={t.href}
            count={t.count}
            finish={t.finish}
          />
        ))}
      </div>
    </section>
  )
}

export default ShopByStyle
