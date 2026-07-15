import { Metadata } from "next"

import OrderOverview from "@modules/account/components/order-overview"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound } from "next/navigation"
import { listOrders } from "@lib/data/orders"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

export default async function Orders() {
  const orders = await listOrders()

  if (!orders) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="orders-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Orders</h1>
        <p className="text-base-regular">
          View your previous orders and their status. Need a return or
          exchange? Check our{" "}
          <LocalizedClientLink href="/returns" className="underline">
            returns policy
          </LocalizedClientLink>{" "}
          or{" "}
          <LocalizedClientLink href="/contact" className="underline">
            contact us
          </LocalizedClientLink>
          .
        </p>
      </div>
      <div>
        <OrderOverview orders={orders} />
      </div>
    </div>
  )
}
