import { Metadata } from "next"

import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import SearchMount from "@modules/search/components/search-mount"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { toTrendingProducts } from "@modules/search/components/search-drawer/trending-data"
import { getBaseURL } from "@lib/util/env"
// GARAGE-DISABLED (WB-076): account garage sync unmounted — the active
// vehicle lives only in the browser cache now.
// import { getCustomer } from "@lib/data/customer"
// import GarageAuthSync from "@lib/garage/garage-auth-sync"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  // GARAGE-DISABLED (WB-076): const customer = await getCustomer()
  // getHomeCatalog is react.cache-deduped per request, so this costs nothing
  // extra on the homepage (which already calls it) and is the only Meili
  // round-trip on other pages — trades off simplicity for the search
  // drawer's Trending panel to show real newest products (WB-085 N3).
  const { newestProducts } = await getHomeCatalog()
  const trendingProducts = toTrendingProducts(newestProducts)
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className="frame">
        {/* GARAGE-DISABLED (WB-076): <GarageAuthSync customerId={customer?.id ?? null} /> */}
        <Nav />
        {props.children}
        <Footer />
        <SearchMount trendingProducts={trendingProducts} />
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
