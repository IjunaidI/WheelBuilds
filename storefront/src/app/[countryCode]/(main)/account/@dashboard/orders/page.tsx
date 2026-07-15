import { Metadata } from "next"

import OrderOverview from "@modules/account/components/order-overview"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound } from "next/navigation"
import { listOrders } from "@lib/data/orders"
import { ordersPageParams } from "@lib/data/orders-page-params"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

type OrdersPageProps = {
  // WB-093 A6: Next 15 -- `searchParams` is a Promise, must be awaited.
  searchParams: Promise<{ page?: string }>
}

export default async function Orders({ searchParams }: OrdersPageProps) {
  const sp = await searchParams
  // Mirrors the discovery route's `Math.max(1, num("page") ?? 1)` parsing
  // convention (modules/discovery/data/types.ts); ordersPageParams clamps
  // again defensively so an out-of-range/garbage value can never reach
  // listOrders as a negative offset.
  const rawPage = Number(sp?.page)
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
  const { limit, offset } = ordersPageParams(page)
  const { orders, count } = await listOrders(limit, offset)

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
        <OrderOverview
          orders={orders}
          count={count}
          page={page}
          limit={limit}
        />
      </div>
    </div>
  )
}
