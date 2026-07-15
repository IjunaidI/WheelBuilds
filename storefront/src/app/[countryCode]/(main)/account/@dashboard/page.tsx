import { Metadata } from "next"

import Overview from "@modules/account/components/overview"
import { notFound } from "next/navigation"
import { getCustomer } from "@lib/data/customer"
import { listOrders } from "@lib/data/orders"

export const metadata: Metadata = {
  title: "Account",
  description: "Overview of your account activity.",
}

export default async function OverviewTemplate() {
  const customer = await getCustomer().catch(() => null)
  // WB-093 A6: listOrders now resolves { orders, count } (see
  // lib/data/orders.ts); this overview only ever needed the array.
  const orders = (await listOrders().catch(() => null))?.orders ?? null

  if (!customer) {
    notFound()
  }

  return <Overview customer={customer} orders={orders} />
}
