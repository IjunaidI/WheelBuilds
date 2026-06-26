import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import NewDropsRow from "@modules/home/components/new-drops-row"
import ShopByStyle from "@modules/home/components/shop-by-style"
import FeaturedBlocks from "@modules/home/components/featured-blocks"
import ShopByBrand from "@modules/home/components/shop-by-brand"
import CatalogWall from "@modules/home/components/catalog-wall"
import TrustStrip from "@modules/home/components/trust-strip"
import Newsletter from "@modules/home/components/newsletter"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"

export const metadata: Metadata = {
  title: "Wheel Builds — Premium Aftermarket Wheels & Fitment",
  description:
    "Authorized dealer for 40+ premium aftermarket wheel brands. Tell us what you drive — we'll show you only the wheels confirmed to fit.",
}

export default async function Home() {
  const { facets } = await getHomeCatalog()
  const brandCount = Object.keys(facets.brands).length

  return (
    <>
      <Hero brandCount={brandCount} />
      <NewDropsRow />
      <ShopByStyle />
      <FeaturedBlocks />
      <ShopByBrand />
      <CatalogWall />
      <TrustStrip brandCount={brandCount} />
      <Newsletter />
    </>
  )
}
