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
  <aside
    role="dialog"
    aria-modal="true"
    aria-label="Search"
    className="frame"
    style={{
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: "min(480px, 100vw)",
      background: "white",
      borderLeft: "1px solid var(--hairline)",
      boxShadow: "-24px 0 60px -20px rgba(15,15,16,0.18)",
      display: "flex",
      flexDirection: "column",
      zIndex: 90,
    }}
  >
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
  </aside>
)

export default SearchDrawer
