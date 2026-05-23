"use client"

import Header from "./header"
import FindByVehicle from "./find-by-vehicle"
import PopularSearches from "./popular-searches"
import Trending from "./trending"
import RecentSearches from "./recent-searches"

type SearchDrawerProps = {
  onClose: () => void
}

const SearchDrawer = ({ onClose }: SearchDrawerProps) => (
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
      <Trending onClose={onClose} />
      <RecentSearches onClose={onClose} />
    </div>
  </>
)

export default SearchDrawer
