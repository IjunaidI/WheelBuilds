import { Text, Section, Hr, Link } from '@react-email/components'
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
}

export interface ShippingConfirmationData {
  order: ShippingConfirmationOrder
  shippingAddress?: ShippingConfirmationAddress
  trackingNumbers?: string[]
  trackingLinks?: ShippingConfirmationTrackingLink[]
  preview?: string
}

export const isShippingConfirmationData = (data: any): data is ShippingConfirmationData =>
  typeof data.order === 'object' && typeof data.order.id === 'string'

export const ShippingConfirmationTemplate: React.FC<ShippingConfirmationData> & {
  PreviewProps: ShippingConfirmationPreviewProps
} = ({ order, shippingAddress, trackingNumbers, trackingLinks, preview = 'Your order is on its way' }) => {
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

        <div style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #ddd',
          margin: '10px 0'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            backgroundColor: '#f2f2f2',
            padding: '8px',
            borderBottom: '1px solid #ddd'
          }}>
            <Text style={{ fontWeight: 'bold' }}>Item</Text>
            <Text style={{ fontWeight: 'bold' }}>Quantity</Text>
          </div>
          {(order.items ?? []).map((item, n) => (
            <div key={n} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px',
              borderBottom: '1px solid #ddd'
            }}>
              <Text>{item.title}</Text>
              <Text>{item.quantity}</Text>
            </div>
          ))}
        </div>
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
} as ShippingConfirmationPreviewProps

export default ShippingConfirmationTemplate
