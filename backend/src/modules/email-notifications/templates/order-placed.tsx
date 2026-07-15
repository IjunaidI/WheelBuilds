import { Text, Section, Hr, Row, Column, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'
import { OrderDTO, OrderAddressDTO } from '@medusajs/framework/types'
import { formatUsd } from './format-usd'

export const ORDER_PLACED = 'order-placed'

interface OrderPlacedPreviewProps {
  order: OrderDTO & { display_id: string; summary: { raw_current_order_total: { value: number } } }
  shippingAddress: OrderAddressDTO
  orderUrl?: string
}

export interface OrderPlacedTemplateProps {
  order: OrderDTO & { display_id: string; summary: { raw_current_order_total: { value: number } } }
  shippingAddress: OrderAddressDTO
  /**
   * Storefront link back to `/order/confirmed/[id]` (built by the
   * `order.placed` subscriber from `STOREFRONT_URL` + `order.id` — the ONLY
   * route a guest customer has back to their order). Optional so a caller
   * missing it degrades to no button rather than a crash.
   */
  orderUrl?: string
  preview?: string
}

export const isOrderPlacedTemplateData = (data: any): data is OrderPlacedTemplateProps =>
  typeof data.order === 'object' && typeof data.shippingAddress === 'object'

export const OrderPlacedTemplate: React.FC<OrderPlacedTemplateProps> & {
  PreviewProps: OrderPlacedPreviewProps
} = ({ order, shippingAddress, orderUrl, preview = 'Your order has been placed!' }) => {
  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 30px' }}>
          Order Confirmation
        </Text>

        <Text style={{ margin: '0 0 15px' }}>
          Dear {shippingAddress.first_name} {shippingAddress.last_name},
        </Text>

        <Text style={{ margin: '0 0 30px' }}>
          Thank you for your recent order! Here are your order details:
        </Text>

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
          Order Summary
        </Text>
        <Text style={{ margin: '0 0 5px' }}>
          Order ID: {order.display_id}
        </Text>
        <Text style={{ margin: '0 0 5px' }}>
          Order Date: {new Date(order.created_at).toLocaleDateString()}
        </Text>
        <Text style={{ margin: '0 0 20px' }}>
          Total: {formatUsd(order.summary.raw_current_order_total.value)}
        </Text>

        <Hr style={{ margin: '20px 0' }} />

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
          Shipping Address
        </Text>
        <Text style={{ margin: '0 0 5px' }}>
          {shippingAddress.address_1}
        </Text>
        <Text style={{ margin: '0 0 5px' }}>
          {shippingAddress.city}, {shippingAddress.province} {shippingAddress.postal_code}
        </Text>
        <Text style={{ margin: '0 0 20px' }}>
          {shippingAddress.country_code}
        </Text>

        <Hr style={{ margin: '20px 0' }} />

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 15px' }}>
          Order Items
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
            <Column style={{ padding: '8px', textAlign: 'right' }}>
              <Text style={{ fontWeight: 'bold', margin: 0 }}>Price</Text>
            </Column>
          </Row>
          {order.items.map((item) => (
            <Row key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
              <Column style={{ padding: '8px', textAlign: 'left' }}>
                <Text style={{ margin: 0 }}>{item.title} - {item.product_title}</Text>
              </Column>
              <Column style={{ padding: '8px', textAlign: 'center' }}>
                <Text style={{ margin: 0 }}>{item.quantity}</Text>
              </Column>
              <Column style={{ padding: '8px', textAlign: 'right' }}>
                <Text style={{ margin: 0 }}>{formatUsd(item.unit_price)}</Text>
              </Column>
            </Row>
          ))}
        </Section>

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

OrderPlacedTemplate.PreviewProps = {
  order: {
    id: 'test-order-id',
    display_id: 'ORD-123',
    created_at: new Date().toISOString(),
    email: 'test@example.com',
    currency_code: 'USD',
    items: [
      { id: 'item-1', title: 'Item 1', product_title: 'Product 1', quantity: 2, unit_price: 10 },
      { id: 'item-2', title: 'Item 2', product_title: 'Product 2', quantity: 1, unit_price: 25 }
    ],
    shipping_address: {
      first_name: 'Test',
      last_name: 'User',
      address_1: '123 Main St',
      city: 'Anytown',
      province: 'CA',
      postal_code: '12345',
      country_code: 'US'
    },
    summary: { raw_current_order_total: { value: 45 } }
  },
  shippingAddress: {
    first_name: 'Test',
    last_name: 'User',
    address_1: '123 Main St',
    city: 'Anytown',
    province: 'CA',
    postal_code: '12345',
    country_code: 'US'
  },
  orderUrl: 'https://example.com/us/order/confirmed/test-order-id'
} as OrderPlacedPreviewProps

export default OrderPlacedTemplate
