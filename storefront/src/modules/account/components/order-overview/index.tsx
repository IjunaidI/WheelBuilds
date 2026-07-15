"use client"

import { Button } from "@medusajs/ui"

import OrderCard from "../order-card"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import { HttpTypes } from "@medusajs/types"
// Reused across module boundaries already (tire-discovery imports the same
// helper from the wheel discovery module) -- this is pure page-count math,
// not Meilisearch-specific.
import { totalPagesFor } from "@modules/discovery/data/clamp-page"

type OrderOverviewProps = {
  orders: HttpTypes.StoreOrder[]
  // WB-093 A6: `listOrders` was hard-capped at a single page with no way to
  // reach an 11th+ order. `count`/`page`/`limit` come from the Store API's
  // real paginated response (threaded through `?page=` on the orders
  // route) so this can render an honest pager instead of silently
  // truncating order history. Optional + defaulted so existing callers
  // (e.g. the account overview, which only ever shows a handful of recent
  // orders) don't have to pass them.
  count?: number
  page?: number
  limit?: number
}

const OrderOverview = ({
  orders,
  count,
  page = 1,
  limit = 10,
}: OrderOverviewProps) => {
  if (orders?.length) {
    const totalPages = totalPagesFor(count ?? orders.length, limit)

    return (
      <div className="flex flex-col gap-y-8 w-full">
        <div className="flex flex-col gap-y-8 w-full">
          {orders.map((o) => (
            <div
              key={o.id}
              className="border-b border-gray-200 pb-6 last:pb-0 last:border-none"
            >
              <OrderCard order={o} />
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <OrdersPagination currentPage={page} totalPages={totalPages} />
        )}
      </div>
    )
  }

  return (
    <div
      className="w-full flex flex-col items-center gap-y-4"
      data-testid="no-orders-container"
    >
      <h2 className="text-large-semi">No orders yet</h2>
      <p className="text-base-regular">
        Once you place an order, it will show up here.
      </p>
      <div className="mt-4">
        <LocalizedClientLink href="/" passHref>
          <Button data-testid="continue-shopping-button">
            Continue shopping
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default OrderOverview

/**
 * Simple prev/next pager for the orders route (`?page=`). Plain
 * `LocalizedClientLink`s (not a client router hook) so it works as a real
 * navigation -- the orders page is a server component that re-fetches on
 * `?page` change, unlike the discovery module's `DiscoveryPagination` (which
 * drives client-side filter state via `useDiscoveryQuery`/bprogress and
 * uses the WB `.frame` design system that the legacy `@medusajs/ui`-styled
 * account section deliberately doesn't adopt -- see storefront/DESIGN.md).
 */
const OrdersPagination = ({
  currentPage,
  totalPages,
}: {
  currentPage: number
  totalPages: number
}) => (
  <nav
    aria-label="Orders pagination"
    className="flex items-center justify-center gap-x-4 pt-4"
    data-testid="orders-pagination"
  >
    <PageLink
      page={currentPage - 1}
      disabled={currentPage <= 1}
      testId="orders-prev-page"
    >
      <ChevronDown className="rotate-90" size={16} />
      Previous
    </PageLink>
    <span
      className="text-small-regular text-ui-fg-subtle"
      data-testid="orders-page-indicator"
    >
      Page {currentPage} of {totalPages}
    </span>
    <PageLink
      page={currentPage + 1}
      disabled={currentPage >= totalPages}
      testId="orders-next-page"
    >
      Next
      <ChevronDown className="-rotate-90" size={16} />
    </PageLink>
  </nav>
)

// Renders a plain disabled Button at either boundary rather than a Link
// wrapping a disabled Button -- an <a> around a disabled button is still a
// clickable link, so the boundary case has to skip the Link entirely.
const PageLink = ({
  page,
  disabled,
  testId,
  children,
}: {
  page: number
  disabled: boolean
  testId: string
  children: React.ReactNode
}) => {
  if (disabled) {
    return (
      <Button
        variant="secondary"
        disabled
        className="flex items-center gap-x-1"
        data-testid={testId}
      >
        {children}
      </Button>
    )
  }

  return (
    <LocalizedClientLink
      href={`/account/orders${page > 1 ? `?page=${page}` : ""}`}
    >
      <Button
        variant="secondary"
        className="flex items-center gap-x-1"
        data-testid={testId}
      >
        {children}
      </Button>
    </LocalizedClientLink>
  )
}
