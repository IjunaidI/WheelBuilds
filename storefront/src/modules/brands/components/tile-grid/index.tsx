import BrandTile from "@modules/common/components/brand-tile"
import type { BrandTile as BrandTileData } from "../../data/brand-tiles"

type TileGridProps = {
  tiles: BrandTileData[]
}

/**
 * The `/brands` index grid. Same classes + `<BrandTile>` primitive as the
 * home `ShopByBrand` section (`modules/home/components/shop-by-brand`) — no
 * new visual language, just a full-page-width version of that grid fed by
 * every live brand instead of the home page's implicit top-N.
 */
const BrandTileGrid = ({ tiles }: TileGridProps) => (
  <div className="grid grid-cols-2 xsmall:grid-cols-3 small:grid-cols-4 gap-3 small:gap-4">
    {tiles.map((tile) => (
      <BrandTile key={tile.href} name={tile.name} count={tile.count} href={tile.href} />
    ))}
  </div>
)

export default BrandTileGrid
