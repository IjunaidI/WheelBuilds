import { notFound } from "next/navigation"

// GARAGE-DISABLED (WB-076): the account garage is retired — the active
// vehicle lives only in the browser cache, so this route 404s. The original
// page is preserved below; the GarageManager component
// (@modules/account/components/garage) is kept intact for restoration.
export default function Garage() {
  notFound()
}

/* GARAGE-DISABLED (WB-076) — original page:

import { Metadata } from "next"
import { notFound } from "next/navigation"

import GarageManager from "@modules/account/components/garage"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Garage",
  description: "Manage your saved vehicles.",
}

export default async function Garage() {
  const customer = await getCustomer()

  if (!customer) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="garage-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Garage</h1>
        <p className="text-base-regular">
          Your saved vehicles. Set one active to see only the wheels confirmed to fit it.
        </p>
      </div>
      <GarageManager />
    </div>
  )
}
*/
