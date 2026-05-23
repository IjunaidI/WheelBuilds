import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import NewDropsRow from "@modules/home/components/new-drops-row"
import ShopByStyle from "@modules/home/components/shop-by-style"
import FeaturedBlocks from "@modules/home/components/featured-blocks"
import ShopByBrand from "@modules/home/components/shop-by-brand"
import BuildGallery from "@modules/home/components/build-gallery"
import TrustStrip from "@modules/home/components/trust-strip"
import Newsletter from "@modules/home/components/newsletter"

export const metadata: Metadata = {
  title: "Wheel Builds — Premium Aftermarket Wheels & Fitment",
  description:
    "Authorized dealer for 40+ premium aftermarket wheel brands. Tell us what you drive — we'll show you only the wheels confirmed to fit.",
}

export default async function Home() {
  return (
    <>
      <Hero />
      <NewDropsRow />
      <ShopByStyle />
      <FeaturedBlocks />
      <ShopByBrand />
      <BuildGallery />
      <TrustStrip />
      <Newsletter />
    </>
  )
}
