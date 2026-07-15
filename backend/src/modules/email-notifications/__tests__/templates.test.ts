import * as React from 'react'
import { renderTemplate } from './render-template'
import { Base } from '../templates/base'
import { OrderPlacedTemplate } from '../templates/order-placed'
import { OrderCanceledTemplate } from '../templates/order-canceled'
import { ShippingConfirmationTemplate } from '../templates/shipping-confirmation'
import { InviteUserEmail } from '../templates/invite-user'
import { PasswordResetTemplate } from '../templates/password-reset'
import { VendorSyncAlertTemplate } from '../templates/vendor-sync-alert'
import { generateEmailTemplate, EmailTemplates } from '../templates'

/**
 * The wordmark `<Text>` in `base.tsx` is the only place any of these
 * templates set `uppercase` (react-email/tailwind compiles the `uppercase`
 * class to a literal `text-transform:uppercase` inline style), so counting
 * this substring doubles as a dedup guard: a resurrected inline wordmark
 * `<Section>` in invite-user/password-reset would push the count to 2.
 */
const UPPERCASE_MARKER = 'text-transform:uppercase'

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('Base (WB-094 A7 — branded header/footer)', () => {
  it('renders the Wheel Builds wordmark header + support/copyright footer by default', async () => {
    const html = await renderTemplate(
      React.createElement(Base, { preview: 'preview text' }, React.createElement('span', null, 'CHILD_CONTENT'))
    )
    expect(count(html, UPPERCASE_MARKER)).toBe(1)
    expect(html).toContain('Wheel Builds')
    expect(html).toContain('Reply to this email')
    expect(html).toMatch(/© \d{4} Wheel Builds\. All rights reserved\./)
    expect(html).toContain('CHILD_CONTENT')
  })

  it('omits the header + footer when branded=false (internal ops emails)', async () => {
    const html = await renderTemplate(
      React.createElement(
        Base,
        { preview: 'preview text', branded: false },
        React.createElement('span', null, 'CHILD_CONTENT')
      )
    )
    expect(html).not.toContain('Wheel Builds')
    expect(html).not.toContain('Reply to this email')
    expect(html).not.toContain(UPPERCASE_MARKER)
    expect(html).toContain('CHILD_CONTENT')
  })
})

describe('OrderPlacedTemplate (WB-094 A7)', () => {
  it('renders the branded header, formats money, and includes the order link', async () => {
    const html = await renderTemplate(React.createElement(OrderPlacedTemplate, OrderPlacedTemplate.PreviewProps))

    // Branded header (default Base branded=true, order-placed doesn't opt out).
    expect(count(html, UPPERCASE_MARKER)).toBe(1)

    // Money is formatted via formatUsd — no raw major-unit values and no
    // stray currency-code interpolation left over from the old
    // `{value} {currency_code}` rendering.
    expect(html).toContain('$45.00') // order total
    expect(html).toContain('$10.00') // item 1 unit price
    expect(html).toContain('$25.00') // item 2 unit price
    expect(html).not.toContain('USD')

    // Outlook-safe item rows: Row/Column render <table role="presentation">
    // and <td>, not the old flex-div rows.
    expect(html).toContain('role="presentation"')
    expect(html).toContain('data-id="__react-email-column"')
    expect(html).not.toContain('display:flex')

    // "View your order" button links back to /order/confirmed/<id>.
    expect(html).toContain('View your order')
    expect(html).toContain('href="https://example.com/us/order/confirmed/test-order-id"')
  })

  it('omits the order-link button when no orderUrl is supplied', async () => {
    const { orderUrl, ...rest } = OrderPlacedTemplate.PreviewProps as any
    const html = await renderTemplate(React.createElement(OrderPlacedTemplate, rest))
    expect(html).not.toContain('View your order')
  })
})

describe('OrderCanceledTemplate (WB-094 Task 3 — order.canceled coverage)', () => {
  it('renders the order id, canceled items, hedged refund line, and the order link', async () => {
    const html = await renderTemplate(React.createElement(OrderCanceledTemplate, OrderCanceledTemplate.PreviewProps))

    expect(count(html, UPPERCASE_MARKER)).toBe(1)
    expect(html).toContain('Order Canceled')
    expect(html).toContain('ORD-123')
    expect(html).toContain('Item 1')
    expect(html).toContain('Item 2')

    // Honesty constraint: hedge on refund, no invented amount/timeline.
    expect(html).toContain("If you were charged, we&#x27;ll process the refund to your original payment method")
    expect(html).not.toMatch(/\$\d/) // no dollar amount anywhere in this email

    expect(html).toContain('View your order')
    expect(html).toContain('href="https://example.com/us/order/confirmed/test-order-id"')
  })

  it('omits the order-link button when no orderUrl is supplied', async () => {
    const { orderUrl, ...rest } = OrderCanceledTemplate.PreviewProps as any
    const html = await renderTemplate(React.createElement(OrderCanceledTemplate, rest))
    expect(html).not.toContain('View your order')
  })

  it('falls back to a generic greeting when no shippingAddress is supplied', async () => {
    const { shippingAddress, ...rest } = OrderCanceledTemplate.PreviewProps as any
    const html = await renderTemplate(React.createElement(OrderCanceledTemplate, rest))
    expect(html).toContain('Dear there')
  })
})

describe('generateEmailTemplate (WB-094 Task 3 — order.canceled wiring)', () => {
  it('renders OrderCanceledTemplate for EmailTemplates.ORDER_CANCELED', async () => {
    const element = generateEmailTemplate(EmailTemplates.ORDER_CANCELED, OrderCanceledTemplate.PreviewProps)
    const html = await renderTemplate(element as React.ReactElement)
    expect(html).toContain('Order Canceled')
    expect(html).toContain('ORD-123')
  })

  it('throws MedusaError when ORDER_CANCELED data has no order', () => {
    expect(() => generateEmailTemplate(EmailTemplates.ORDER_CANCELED, {})).toThrow(
      /Invalid data for template "order-canceled"/
    )
  })

  it('still throws MedusaError for an unknown template key (unchanged behavior)', () => {
    expect(() => generateEmailTemplate('not-a-real-template', {})).toThrow(
      /Unknown template key: "not-a-real-template"/
    )
  })
})

describe('ShippingConfirmationTemplate (WB-094 A7)', () => {
  it('renders Outlook-safe item rows and the order-link button', async () => {
    const html = await renderTemplate(
      React.createElement(ShippingConfirmationTemplate, ShippingConfirmationTemplate.PreviewProps)
    )

    expect(html).toContain('role="presentation"')
    expect(html).toContain('data-id="__react-email-column"')
    expect(html).not.toContain('display:flex')

    expect(html).toContain('View your order')
    expect(html).toContain('href="https://example.com/us/order/confirmed/order_123"')

    // Still branded (shipping-confirmation doesn't opt out).
    expect(count(html, UPPERCASE_MARKER)).toBe(1)
  })

  it('omits the order-link button when no orderUrl is supplied', async () => {
    const { orderUrl, ...rest } = ShippingConfirmationTemplate.PreviewProps as any
    const html = await renderTemplate(React.createElement(ShippingConfirmationTemplate, rest))
    expect(html).not.toContain('View your order')
  })
})

describe('invite-user / password-reset (WB-094 A7 — no duplicate wordmark)', () => {
  it('InviteUserEmail renders exactly one wordmark (base header, not a local duplicate)', async () => {
    const html = await renderTemplate(React.createElement(InviteUserEmail, InviteUserEmail.PreviewProps))
    expect(count(html, UPPERCASE_MARKER)).toBe(1)
  })

  it('PasswordResetTemplate renders exactly one wordmark (base header, not a local duplicate)', async () => {
    const html = await renderTemplate(React.createElement(PasswordResetTemplate, PasswordResetTemplate.PreviewProps))
    expect(count(html, UPPERCASE_MARKER)).toBe(1)
  })
})

describe('PasswordResetTemplate (WB-094 Task 3 — honest 15-minute expiry)', () => {
  it('states the real 15-minute TTL instead of the vague "expires shortly"', async () => {
    const html = await renderTemplate(React.createElement(PasswordResetTemplate, PasswordResetTemplate.PreviewProps))
    expect(html).toContain('This link expires in 15 minutes.')
    expect(html).not.toContain('expires shortly')
  })
})

describe('VendorSyncAlertTemplate (WB-094 A7 — opts out of branding)', () => {
  it('renders with no customer chrome (internal ops email)', async () => {
    const html = await renderTemplate(
      React.createElement(VendorSyncAlertTemplate, VendorSyncAlertTemplate.PreviewProps)
    )
    expect(html).not.toContain('Wheel Builds')
    expect(html).not.toContain('Reply to this email')
    expect(html).not.toContain(UPPERCASE_MARKER)
  })
})
