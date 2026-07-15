import { Text, Section, Hr, Row, Column, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import { OrderDTO, OrderAddressDTO } from '@medusajs/framework/types'

export const ORDER_CANCELED = 'order-canceled'

interface OrderCanceledOrderItem {
  id: string
  title: string
  product_title?: string
  quantity: number
}

interface OrderCanceledPreviewProps {
  order: OrderDTO & { display_id: string; items: OrderCanceledOrderItem[] }
  shippingAddress?: OrderAddressDTO
  orderUrl?: string
  preview?: string
}

export interface OrderCanceledData {
  order: OrderDTO & { display_id: string; items?: OrderCanceledOrderItem[] }
  shippingAddress?: OrderAddressDTO
  /**
   * Storefront link back to `/order/confirmed/[id]` (built by the
   * `order.canceled` subscriber from `STOREFRONT_URL` + `order.id`). Optional
   * so a caller missing it degrades to no button rather than a crash.
   */
  orderUrl?: string
  preview?: string
}

export const isOrderCanceledData = (data: any): data is OrderCanceledData =>
  data && typeof data === 'object' && typeof data.order === 'object' && data.order !== null

export const OrderCanceledTemplate: React.FC<OrderCanceledData> & {
  PreviewProps: OrderCanceledPreviewProps
} = ({ order, shippingAddress, orderUrl, preview = 'Your order has been canceled' }) => {
  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 30px' }}>
          Order Canceled
        </Text>

        <Text style={{ margin: '0 0 15px' }}>
          Dear {shippingAddress?.first_name ?? 'there'}
          {shippingAddress?.last_name ? ` ${shippingAddress.last_name}` : ''},
        </Text>

        <Text style={{ margin: '0 0 20px' }}>
          Your order {order.display_id ? `#${order.display_id}` : ''} has been canceled.
        </Text>

        {!!order.items?.length && (
          <>
            <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
              Canceled Items
            </Text>

            {/*
              @react-email/components has NO `Table` export. `Row`/`Column` each
              render an Outlook-safe `<table role="presentation"><tr>` / `<td>` —
              stacking one `Row` per line is the intended (and only) primitive,
              replacing the flex-div rows Outlook's Word rendering engine can't
              lay out.
            */}
            <Section style={{ border: '1px solid #ddd', margin: '10px 0' }}>
              <Row style={{ backgroundColor: '#f2f2f2', borderBottom: '1px solid #ddd' }}>
                <Column style={{ padding: '8px', textAlign: 'left' }}>
                  <Text style={{ fontWeight: 'bold', margin: 0 }}>Item</Text>
                </Column>
                <Column style={{ padding: '8px', textAlign: 'center' }}>
                  <Text style={{ fontWeight: 'bold', margin: 0 }}>Quantity</Text>
                </Column>
              </Row>
              {order.items!.map((item) => (
                <Row key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <Column style={{ padding: '8px', textAlign: 'left' }}>
                    <Text style={{ margin: 0 }}>
                      {item.title}
                      {item.product_title ? ` - ${item.product_title}` : ''}
                    </Text>
                  </Column>
                  <Column style={{ padding: '8px', textAlign: 'center' }}>
                    <Text style={{ margin: 0 }}>{item.quantity}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          </>
        )}

        <Hr style={{ margin: '20px 0' }} />

        {/*
          Honesty constraint (WB-094): the `order.canceled` event payload carries
          only `{ id }` — no refund amount or timeline. `cancelOrderWorkflow`
          (core-flows) DOES unconditionally refund any captured payment as part of
          cancellation, so "if you were charged, we'll refund it" is true — but we
          don't know a specific amount or ETA, so we don't invent one.
        */}
        <Text style={{ margin: 0, color: '#666666', fontSize: '14px' }}>
          If you were charged, we'll process the refund to your original payment method —
          contact us with any questions.
        </Text>

        {orderUrl && (
          <Section style={{ textAlign: 'center', margin: '30px 0 0' }}>
            <Button
              style={{
                backgroundColor: '#000000',
                borderRadius: '4px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                padding: '12px 20px',
              }}
              href={orderUrl}
            >
              View your order
            </Button>
          </Section>
        )}
      </Section>
    </Base>
  )
}

OrderCanceledTemplate.PreviewProps = {
  order: {
    id: 'test-order-id',
    display_id: 'ORD-123',
    email: 'test@example.com',
    currency_code: 'USD',
    items: [
      { id: 'item-1', title: 'Item 1', product_title: 'Product 1', quantity: 2 },
      { id: 'item-2', title: 'Item 2', product_title: 'Product 2', quantity: 1 }
    ]
  },
  shippingAddress: {
    first_name: 'Test',
    last_name: 'User'
  },
  orderUrl: 'https://example.com/us/order/confirmed/test-order-id'
} as OrderCanceledPreviewProps

export default OrderCanceledTemplate
