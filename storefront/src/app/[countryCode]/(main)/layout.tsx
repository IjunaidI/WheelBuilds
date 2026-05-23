import { Metadata } from "next"

import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import SearchMount from "@modules/search/components/search-mount"
import { getBaseURL } from "@lib/util/env"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  return (
    <div className="frame">
      <Nav />
      {props.children}
      <Footer />
      <SearchMount />
    </div>
  )
}
