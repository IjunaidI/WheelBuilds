import { Metadata } from "next"

import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import SearchMount from "@modules/search/components/search-mount"
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
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <div className="frame">
        {/* GARAGE-DISABLED (WB-076): <GarageAuthSync customerId={customer?.id ?? null} /> */}
        <Nav />
        {props.children}
        <Footer />
        <SearchMount />
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
