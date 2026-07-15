import { Text, Section, Hr, Link, Row, Column, Button } from '@react-email/components'
import * as React from 'react'
import { Base } from './base'

export const SHIPPING_CONFIRMATION = 'shipping-confirmation'

interface ShippingConfirmationOrderItem {
  title: string
  quantity: number
}

interface ShippingConfirmationOrder {
  id: string
  display_id?: number | string
  email?: string
  items?: ShippingConfirmationOrderItem[]
}

interface ShippingConfirmationAddress {
  first_name?: string
  last_name?: string
  address_1?: string
  city?: string
  province?: string
  postal_code?: string
  country_code?: string
}

interface ShippingConfirmationTrackingLink {
  url?: string
  tracking_number?: string
}

interface ShippingConfirmationPreviewProps {
  order: ShippingConfirmationOrder
  shippingAddress: ShippingConfirmationAddress
  trackingNumbers?: string[]
  orderUrl?: string
}

export interface ShippingConfirmationData {
  order: ShippingConfirmationOrder
  shippingAddress?: ShippingConfirmationAddress
  trackingNumbers?: string[]
  trackingLinks?: ShippingConfirmationTrackingLink[]
  /**
   * Storefront link back to `/order/confirmed/[id]` (built by the
   * `shipment.created` subscriber from `STOREFRONT_URL` + `order.id`).
   * Optional so a caller missing it degrades to no button rather than a crash.
   */
  orderUrl?: string
  preview?: string
}

export const isShippingConfirmationData = (data: any): data is ShippingConfirmationData =>
  typeof data.order === 'object' && typeof data.order.id === 'string'

export const ShippingConfirmationTemplate: React.FC<ShippingConfirmationData> & {
  PreviewProps: ShippingConfirmationPreviewProps
} = ({ order, shippingAddress, trackingNumbers, trackingLinks, orderUrl, preview = 'Your order is on its way' }) => {
  return (
    <Base preview={preview}>
      <Section>
        <Text style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: '0 0 30px' }}>
          Your Order Has Shipped
        </Text>

        <Text style={{ margin: '0 0 15px' }}>
          Dear {shippingAddress?.first_name} {shippingAddress?.last_name},
        </Text>

        <Text style={{ margin: '0 0 30px' }}>
          Good news — your order #{order.display_id ?? order.id} is on its way to you.
        </Text>

        {(trackingLinks?.length || trackingNumbers?.length) && (
          <>
            <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 10px' }}>
              Tracking Information
            </Text>
            {trackingLinks?.length
              ? trackingLinks.map((t, n) => (
                  <Text key={n} style={{ margin: '0 0 5px' }}>
                    {t.url ? <Link href={t.url}>{t.tracking_number ?? t.url}</Link> : t.tracking_number}
                  </Text>
                ))
              : trackingNumbers?.map((tn, n) => (
                  <Text key={n} style={{ margin: '0 0 5px' }}>
                    Tracking #: {tn}
                  </Text>
                ))}

            <Hr style={{ margin: '20px 0' }} />
          </>
        )}

        {shippingAddress && (
          <>
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
          </>
        )}

        <Text style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 15px' }}>
          Items Shipped
        </Text>

        {/*
          @react-email/components has NO `Table` export. `Row`/`Column` each
          render an Outlook-safe `<table role="presentation"><tr>` / `<td>` —
          stacking one `Row` per line replaces the flex-div rows Outlook's
          Word rendering engine can't lay out.
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
          {(order.items ?? []).map((item, n) => (
            <Row key={n} style={{ borderBottom: '1px solid #ddd' }}>
              <Column style={{ padding: '8px', textAlign: 'left' }}>
                <Text style={{ margin: 0 }}>{item.title}</Text>
              </Column>
              <Column style={{ padding: '8px', textAlign: 'center' }}>
                <Text style={{ margin: 0 }}>{item.quantity}</Text>
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

ShippingConfirmationTemplate.PreviewProps = {
  order: {
    id: 'order_123',
    display_id: 1001,
    email: 'test@example.com',
    items: [
      { title: 'Method MR305 NV 20x10', quantity: 4 },
    ],
  },
  shippingAddress: {
    first_name: 'Jane',
    last_name: 'Doe',
    address_1: '1 Main St',
    city: 'Austin',
    province: 'TX',
    postal_code: '78701',
    country_code: 'US',
  },
  trackingNumbers: ['1Z999AA10123456784'],
  orderUrl: 'https://example.com/us/order/confirmed/order_123',
} as ShippingConfirmationPreviewProps

export default ShippingConfirmationTemplate
