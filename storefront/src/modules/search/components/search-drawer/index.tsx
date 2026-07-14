"use client"

import Header from "./header"
import FindByVehicle from "./find-by-vehicle"
import PopularSearches from "./popular-searches"
import Trending from "./trending"
import RecentSearches from "./recent-searches"
import type { TrendingProduct } from "./trending-data"

type SearchDrawerProps = {
  onClose: () => void
  /** Real newest-products for the Trending panel (WB-085 N3), fetched server-side by the layout. */
  trendingProducts: TrendingProduct[]
}

const SearchDrawer = ({ onClose, trendingProducts }: SearchDrawerProps) => (
  <>
    <Header onClose={onClose} />
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 24,
        background: "white",
      }}
    >
      <FindByVehicle onClose={onClose} />
      <PopularSearches onClose={onClose} />
      <Trending onClose={onClose} products={trendingProducts} />
      <RecentSearches onClose={onClose} />
    </div>
  </>
)

export default SearchDrawer
