import CategoryTile from "@modules/common/components/category-tile"
import type { StyleTile } from "@modules/home/components/shop-by-style/style-map"

type TileGridProps = {
  tiles: StyleTile[]
}

/**
 * The `/styles` index grid. Same `<CategoryTile>` primitive (with the Wheel
 * illustration + finish) as the home `ShopByStyle` section
 * (`modules/home/components/shop-by-style`) — no new visual language, just a
 * full-page-width version of that grid fed by every `STYLE_DEFS` tile
 * instead of the home page's implicit subset.
 */
const StyleTileGrid = ({ tiles }: TileGridProps) => (
  <div className="grid grid-cols-2 small:grid-cols-3 gap-4">
    {tiles.map((tile) => (
      <CategoryTile
        key={tile.href}
        label={tile.label}
        href={tile.href}
        count={tile.count}
        finish={tile.finish}
      />
    ))}
  </div>
)

export default StyleTileGrid
