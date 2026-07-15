import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

import { formatStatus } from "./format-status"
import { FulfillmentLike, trackingLinks } from "./tracking-links"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  // The pinned `@medusajs/types` here predates fulfillment `labels`
  // (`StoreOrderFulfillment` shares zero declared properties with
  // `FulfillmentLike`, which trips TS's "weak type" check on a direct
  // assignment) even though the field is requested via `retrieveOrder`'s
  // `*fulfillments.labels` and present at runtime. Narrow cast through
  // `unknown` rather than fighting the stale .d.ts -- see tracking-links.ts.
  const tracking = trackingLinks(
    order.fulfillments as unknown as FulfillmentLike[] | undefined
  )

  return (
    <div>
      <Text>
        We have sent the order confirmation details to{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
        .
      </Text>
      <Text className="mt-2">
        Order date:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toDateString()}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        Order number: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              Order status:{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {formatStatus(order.fulfillment_status)}
              </span>
            </Text>
            <Text>
              Payment status:{" "}
              <span
                className="text-ui-fg-subtle "
                data-testid="order-payment-status"
              >
                {formatStatus(order.payment_status)}
              </span>
            </Text>
          </>
        )}
      </div>

      {tracking.length > 0 && (
        <div className="mt-4" data-testid="order-tracking">
          <Text className="txt-medium-plus text-ui-fg-base">Tracking</Text>
          <ul className="mt-1 flex flex-col gap-y-1">
            {tracking.map((t) => (
              <li key={t.number}>
                <Text className="text-ui-fg-subtle" as="span">
                  {t.url ? (
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive underline"
                      data-testid="tracking-link"
                    >
                      {t.number}
                    </a>
                  ) : (
                    <span data-testid="tracking-number">{t.number}</span>
                  )}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default OrderDetails
