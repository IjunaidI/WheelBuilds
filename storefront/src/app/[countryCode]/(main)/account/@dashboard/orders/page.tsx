import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import OrderOverview from "@modules/account/components/order-overview"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { listOrders } from "@lib/data/orders"
import { ordersPageParams } from "@lib/data/orders-page-params"
import { clampPage, withClampedPage } from "@modules/discovery/data/clamp-page"

export const metadata: Metadata = {
  title: "Orders",
  description: "Overview of your previous orders.",
}

type OrdersPageProps = {
  // WB-093 A6: Next 15 -- `searchParams`/`params` are Promises, must be
  // awaited. `searchParams` is typed as the discovery route's generic
  // `Record<string, string | string[] | undefined>` (not just `{ page?:
  // string }`) so it can be passed straight to `withClampedPage` below.
  searchParams: Promise<Record<string, string | string[] | undefined>>
  params: Promise<{ countryCode: string }>
}

export default async function Orders({ searchParams, params }: OrdersPageProps) {
  const sp = await searchParams
  // Mirrors the discovery route's `Math.max(1, num("page") ?? 1)` parsing
  // convention (modules/discovery/data/types.ts); ordersPageParams clamps
  // again defensively so an out-of-range/garbage value can never reach
  // listOrders as a negative offset.
  const rawPageParam = Array.isArray(sp?.page) ? sp.page[0] : sp?.page
  const rawPage = Number(rawPageParam)
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
  const { limit, offset } = ordersPageParams(page)
  const { orders, count } = await listOrders(limit, offset)

  if (!orders) {
    notFound()
  }

  // WB-093 (review fix 3): an out-of-range `?page` (e.g. 3 orders but
  // `?page=99`) previously produced an empty `orders` array with no pager --
  // `order-overview/index.tsx` renders its "No orders yet / Continue
  // shopping" empty state, which is a lie, and the customer has no way back
  // without hand-editing the URL. Same clamp-and-redirect the `/store`
  // discovery route uses (WB-088 D11): `count` is the Store API's real total
  // for this customer's orders regardless of whether this page's slice came
  // back empty, so redirect to the last valid page instead of rendering the
  // false empty state.
  const lastPage = clampPage(page, count, limit)
  if (lastPage !== page) {
    const { countryCode } = await params
    const qs = withClampedPage(sp, lastPage)
    redirect(`/${countryCode}/account/orders${qs ? `?${qs}` : ""}`)
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
