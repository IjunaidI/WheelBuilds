import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import NewDropsRow from "@modules/home/components/new-drops-row"
import ShopByStyle from "@modules/home/components/shop-by-style"
import FeaturedBlocks from "@modules/home/components/featured-blocks"
import TiresBand from "@modules/home/components/tires-band"
import ShopByBrand from "@modules/home/components/shop-by-brand"
import CatalogWall from "@modules/home/components/catalog-wall"
import TrustStrip from "@modules/home/components/trust-strip"
import Newsletter from "@modules/home/components/newsletter"
import { getHomeCatalog } from "@modules/home/data/get-home-catalog"
import { homeMetaDescription } from "@modules/home/data/meta-description"

export async function generateMetadata(): Promise<Metadata> {
  const { facets } = await getHomeCatalog()
  const brandCount = Object.keys(facets.brands).length
  return {
    title: "Wheel Builds — Premium Aftermarket Wheels & Fitment",
    description: homeMetaDescription(brandCount || undefined),
  }
}

type Props = {
  params: Promise<{ countryCode: string }>
}

export default async function Home({ params }: Props) {
  const { countryCode } = await params
  const { facets } = await getHomeCatalog()
  const brandCount = Object.keys(facets.brands).length

  return (
    <>
      <Hero brandCount={brandCount} />
      <NewDropsRow />
      <ShopByStyle />
      <FeaturedBlocks countryCode={countryCode} />
      <TiresBand />
      <ShopByBrand />
      <CatalogWall />
      <TrustStrip brandCount={brandCount} />
      <Newsletter />
    </>
  )
}
