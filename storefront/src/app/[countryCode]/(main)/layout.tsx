import { Metadata } from "next"

import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import SearchMount from "@modules/search/components/search-mount"
import { getBaseURL } from "@lib/util/env"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function PageLayout(props: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className="frame">
        <Nav />
        {props.children}
        <Footer />
        <SearchMount />
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
