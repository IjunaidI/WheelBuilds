# Transactional Email + Account Recovery — Implementation Plan (WB-078)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the store actually email customers (order + shipping confirmation), give shoppers a working password-reset flow (none exists today), kill the `info@example.com` reply-to, and rebrand the "invited to Medusa" email — so a launch customer is never permanently locked out and every transactional touchpoint sends.

**Architecture:** The Resend send path is already code-complete — setting `RESEND_API_KEY` + `RESEND_FROM_EMAIL` on prod (with a verified sender domain in Resend) makes order-confirmation emails send with no code change. This plan is additive: document the two env vars in `.env.template`, add `EMAIL_REPLY_TO`/`STOREFRONT_URL` envs, add a shipping-confirmation template + `shipment.created` subscriber (global-container rule), add the entire password-reset flow (backend `auth.password_reset` subscriber + template, storefront forgot/reset pages via the JS SDK), and replace the dead change-password form with a reset-email button (decision D4).

**Tech Stack:** Backend MedusaJS 2.13.6, `resend@4.0.1`, `react-email@5.1.0` templates, subscribers on the global container. Storefront Next.js 15 App Router, `@medusajs/js-sdk` (installed `2.1.4-preview`; `sdk.auth.resetPassword` + `sdk.auth.updateProvider` confirmed present), Server Actions.

## Global Constraints

- **Decision D4 = reset-email button.** The account "change password" form is replaced by a "Send password reset email" button reusing the forgot-password action — NOT an in-place authenticated change.
- **Server Actions return error STRINGS, never throw, never return objects** (the register/login React #31 lesson). `redirect()` is called OUTSIDE the try/catch (it throws `NEXT_REDIRECT`). Model every new action on `login`/`signup` in `storefront/src/lib/data/customer.ts`.
- **Off-request container rule.** New subscribers (`shipment.created`, `auth.password_reset`) resolve services from the subscriber's `container` arg (global container) and use `query.graph` for cross-module reads — never `this.container_` (module cradle) or a disposed `req.scope`. `order-placed.ts` is the reference.
- **`EmailTemplates` is a `const … as const` object, not a TS enum.** Add keys the way `INVITE_USER`/`ORDER_PLACED` are added (README's step-2 enum syntax is stale).
- **Reply-to is applied unconditionally by the service** (`resend.ts:79`). To omit it when unset, subscribers pass `replyTo: EMAIL_REPLY_TO || undefined` (Resend's `replyTo` is optional; `undefined` is safe).
- **No account enumeration** on forgot-password — always render "if that account exists, an email is on its way", regardless of whether the email is known.
- **`getAuthHeaders()` is async — always await it** at every call site (un-awaited spreads silently drop the Authorization header).
- **Stale-config trap:** after adding env on Railway, if the notification module doesn't register, `rm -rf backend/.medusa/server` before redeploy.

## File Structure

**Backend**
- `backend/src/lib/constants.ts` — ADD `EMAIL_REPLY_TO`, `STOREFRONT_URL` exports.
- `backend/.env.template` — ADD `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_REPLY_TO`, `STOREFRONT_URL`.
- `backend/src/subscribers/order-placed.ts` — `replyTo` → env.
- `backend/src/subscribers/invite-created.ts` — `replyTo` → env.
- `backend/src/modules/email-notifications/templates/invite-user.tsx` — rebrand Medusa → Wheel Builds.
- `backend/src/modules/email-notifications/templates/shipping-confirmation.tsx` — CREATE.
- `backend/src/modules/email-notifications/templates/password-reset.tsx` — CREATE.
- `backend/src/modules/email-notifications/templates/index.tsx` — register both new keys + cases.
- `backend/src/subscribers/shipment-created.ts` — CREATE.
- `backend/src/subscribers/auth-password-reset.ts` — CREATE.

**Storefront**
- `storefront/src/lib/data/customer.ts` — ADD `forgotPassword`, `resetPassword` Server Actions.
- `storefront/src/app/[countryCode]/(main)/forgot-password/page.tsx` — CREATE.
- `storefront/src/modules/account/components/forgot-password/index.tsx` — CREATE (form).
- `storefront/src/app/[countryCode]/(main)/reset-password/page.tsx` — CREATE.
- `storefront/src/modules/account/components/reset-password/index.tsx` — CREATE (form).
- `storefront/src/modules/account/components/login/index.tsx` — ADD "Forgot password?" link.
- `storefront/src/modules/account/components/profile-password/index.tsx` — REPLACE dead form with reset-email button (D4).

---

## Task 1: Env plumbing — document Resend + add reply-to / storefront-url

**Files:**
- Modify: `backend/src/lib/constants.ts`
- Modify: `backend/.env.template`

**Interfaces:**
- Produces: `EMAIL_REPLY_TO: string | undefined`, `STOREFRONT_URL: string` exported from `lib/constants`.

- [ ] **Step 1: Add the constants.** In `backend/src/lib/constants.ts`, below the existing `RESEND_*` block:
```ts
/**
 * (optional) Reply-To address for transactional emails. When unset, no Reply-To
 * header is added (drops the legacy info@example.com literal).
 */
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;

/**
 * Public storefront origin, used to build customer-facing links (e.g. password
 * reset). Falls back to localhost for dev.
 */
export const STOREFRONT_URL = process.env.STOREFRONT_URL || 'http://localhost:8000';
```

- [ ] **Step 2: Document in `.env.template`.** In `backend/.env.template`, add (near the SENDGRID stubs):
```
# Resend transactional email (set BOTH to enable; verify the from-domain in Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
# Optional Reply-To for transactional email; omit to send no Reply-To header
EMAIL_REPLY_TO=
# Public storefront origin (used in password-reset links)
STOREFRONT_URL=http://localhost:8000
```

- [ ] **Step 3: Sanity check the module gates on the two vars.** Confirm (read-only) that `medusa-config.js:167` registers the resend provider iff `RESEND_API_KEY && RESEND_FROM_EMAIL`. No code change; this step documents that setting the two prod env vars is what flips emails on.

- [ ] **Step 4: Commit.**
```bash
git add backend/src/lib/constants.ts backend/.env.template
git commit -m "chore(wb-078): env plumbing — document RESEND_*, add EMAIL_REPLY_TO + STOREFRONT_URL"
```

---

## Task 2: Reply-to hygiene — env-driven, drop the literal

**Files:**
- Modify: `backend/src/subscribers/order-placed.ts`
- Modify: `backend/src/subscribers/invite-created.ts`

**Interfaces:**
- Consumes: `EMAIL_REPLY_TO` (Task 1).

- [ ] **Step 1: order-placed.** Import the env and replace the literal (line ~23):
```ts
import { EMAIL_REPLY_TO } from '../lib/constants'
// ...
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: 'Your order has been placed'
        },
```

- [ ] **Step 2: invite-created.** Same treatment (line ~25):
```ts
import { EMAIL_REPLY_TO } from '../lib/constants'
// ...
        emailOptions: {
          replyTo: EMAIL_REPLY_TO || undefined,
          subject: "You've been invited to Wheel Builds"
        },
```

- [ ] **Step 3: Verify** the module still builds.
Run: `cd backend && npx tsc --noEmit` (expect the same B11 baseline error only, no new errors).

- [ ] **Step 4: Commit.**
```bash
git add backend/src/subscribers/order-placed.ts backend/src/subscribers/invite-created.ts
git commit -m "fix(wb-078): reply-to from EMAIL_REPLY_TO env, drop info@example.com literal"
```

---

## Task 3: Rebrand the invite email (Medusa → Wheel Builds)

**Files:**
- Modify: `backend/src/modules/email-notifications/templates/invite-user.tsx`

- [ ] **Step 1: Replace the branding.** In `invite-user.tsx`: swap the Medusa logo `<Img src=...>` (GitHub-hosted Medusa SVG, ~line 42) for the Wheel Builds wordmark/logo (use the storefront's logo asset URL or a text wordmark if no hosted asset exists); change body copy "invited to be an administrator on **Medusa**" → "**Wheel Builds**" (~line 49) and the default preview "You've been invited to Medusa!" → "You've been invited to Wheel Builds" (~line 36).

- [ ] **Step 2: Visual check.**
Run: `cd backend && pnpm email:dev` (port 3002) → open `invite-user` → confirm Wheel Builds branding, no "Medusa".

- [ ] **Step 3: Commit.**
```bash
git add backend/src/modules/email-notifications/templates/invite-user.tsx
git commit -m "fix(wb-078): rebrand invite email Medusa -> Wheel Builds"
```

---

## Task 4: Shipping-confirmation template + `shipment.created` subscriber

**Files:**
- Create: `backend/src/modules/email-notifications/templates/shipping-confirmation.tsx`
- Modify: `backend/src/modules/email-notifications/templates/index.tsx`
- Create: `backend/src/subscribers/shipment-created.ts`

**Interfaces:**
- Produces: `SHIPPING_CONFIRMATION = 'shipping-confirmation'` key; `<ShippingConfirmationTemplate>` accepting `{ order, shippingAddress, trackingNumbers?, trackingLinks?, preview }`.

- [ ] **Step 1: Create the template** following the module README 4-step recipe (model on `order-placed.tsx`):
```tsx
import { Text, Section, Row, Column, Link } from '@react-email/components'
import { Base } from './base'

export const SHIPPING_CONFIRMATION = 'shipping-confirmation'

export interface ShippingConfirmationData {
  emailOptions: Record<string, unknown>
  order: { id: string; display_id?: number; items?: { title: string; quantity: number }[]; email: string }
  shippingAddress?: { first_name?: string; last_name?: string; address_1?: string; city?: string; province?: string; postal_code?: string }
  trackingNumbers?: string[]
  trackingLinks?: { url?: string; tracking_number?: string }[]
  preview?: string
}

export const isShippingConfirmationData = (d: any): d is ShippingConfirmationData =>
  d && typeof d === 'object' && d.order && typeof d.order.id === 'string'

export const ShippingConfirmationTemplate = ({ order, shippingAddress, trackingNumbers, trackingLinks, preview = 'Your order is on its way' }: ShippingConfirmationData) => (
  <Base preview={preview}>
    <Section>
      <Text>Good news — your order #{order.display_id ?? order.id} has shipped.</Text>
      {(order.items ?? []).map((i, n) => (
        <Row key={n}><Column>{i.title}</Column><Column>×{i.quantity}</Column></Row>
      ))}
      {trackingLinks?.length
        ? trackingLinks.map((t, n) => (
            <Text key={n}>Track: {t.url ? <Link href={t.url}>{t.tracking_number ?? t.url}</Link> : t.tracking_number}</Text>
          ))
        : (trackingNumbers ?? []).map((tn, n) => <Text key={n}>Tracking #: {tn}</Text>)}
      {shippingAddress && (
        <Text>Shipping to {shippingAddress.first_name} {shippingAddress.last_name}, {shippingAddress.address_1}, {shippingAddress.city} {shippingAddress.province} {shippingAddress.postal_code}</Text>
      )}
    </Section>
  </Base>
)

ShippingConfirmationTemplate.PreviewProps = {
  order: { id: 'order_123', display_id: 1001, email: 'test@example.com', items: [{ title: 'Method MR305 NV 20x10', quantity: 4 }] },
  shippingAddress: { first_name: 'Jane', last_name: 'Doe', address_1: '1 Main St', city: 'Austin', province: 'TX', postal_code: '78701' },
  trackingNumbers: ['1Z999AA10123456784'],
  preview: 'Your order is on its way',
} as ShippingConfirmationData

export default ShippingConfirmationTemplate
```

- [ ] **Step 2: Register the key + case.** In `templates/index.tsx`: import `ShippingConfirmationTemplate, SHIPPING_CONFIRMATION, isShippingConfirmationData`; add `SHIPPING_CONFIRMATION` to the `EmailTemplates` object; add a `case`:
```ts
    case EmailTemplates.SHIPPING_CONFIRMATION:
      if (!isShippingConfirmationData(data)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Invalid data for ${SHIPPING_CONFIRMATION}`)
      return <ShippingConfirmationTemplate {...data} />
```
(Add `SHIPPING_CONFIRMATION` into the object as `SHIPPING_CONFIRMATION,` — the object uses shorthand keys whose value is the string constant.)

- [ ] **Step 3: Create the subscriber.** `backend/src/subscribers/shipment-created.ts` — resolve fulfillment → order + email via `query.graph` on the global container; honor `no_notification`:
```ts
import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO } from '../lib/constants'

export default async function shipmentCreatedHandler({ event: { data }, container }: SubscriberArgs<any>) {
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Resolve the fulfillment → its order + shipping labels.
  const { data: fulfillments } = await query.graph({
    entity: 'fulfillment',
    fields: [
      'id', 'no_notification', 'labels.tracking_number', 'labels.tracking_url',
      'order.id', 'order.display_id', 'order.email',
      'order.items.title', 'order.items.quantity',
      'order.shipping_address.first_name', 'order.shipping_address.last_name',
      'order.shipping_address.address_1', 'order.shipping_address.city',
      'order.shipping_address.province', 'order.shipping_address.postal_code',
    ],
    filters: { id: data.id },
  })
  const fulfillment = fulfillments?.[0]
  const order = fulfillment?.order
  if (!order?.email || fulfillment?.no_notification) return

  try {
    await notificationModuleService.createNotifications({
      to: order.email,
      channel: 'email',
      template: EmailTemplates.SHIPPING_CONFIRMATION,
      data: {
        emailOptions: { replyTo: EMAIL_REPLY_TO || undefined, subject: 'Your order has shipped' },
        order,
        shippingAddress: order.shipping_address,
        trackingLinks: (fulfillment.labels ?? []).map((l: any) => ({ url: l.tracking_url, tracking_number: l.tracking_number })),
        trackingNumbers: (fulfillment.labels ?? []).map((l: any) => l.tracking_number).filter(Boolean),
        preview: 'Your order is on its way',
      },
    })
  } catch (error) {
    console.error('Error sending shipping confirmation notification:', error)
  }
}

export const config: SubscriberConfig = { event: 'shipment.created' }
```
(Verify the exact event name against the installed Medusa fulfillment module — `shipment.created` is the documented v2 event; if the resolved graph field names differ, adjust `fields`.)

- [ ] **Step 4: Verify.**
Run: `cd backend && pnpm email:dev` → `shipping-confirmation` renders. `npx tsc --noEmit` → no new errors.

- [ ] **Step 5: Commit.**
```bash
git add backend/src/modules/email-notifications/templates/shipping-confirmation.tsx backend/src/modules/email-notifications/templates/index.tsx backend/src/subscribers/shipment-created.ts
git commit -m "feat(wb-078): shipping-confirmation template + shipment.created subscriber"
```

---

## Task 5: Password-reset backend — subscriber + template

**Files:**
- Create: `backend/src/modules/email-notifications/templates/password-reset.tsx`
- Modify: `backend/src/modules/email-notifications/templates/index.tsx`
- Create: `backend/src/subscribers/auth-password-reset.ts`

**Interfaces:**
- Consumes: `STOREFRONT_URL`, `EMAIL_REPLY_TO` (Task 1).
- Produces: `PASSWORD_RESET = 'password-reset'` key; `<PasswordResetTemplate>` accepting `{ resetLink, preview }`.

- [ ] **Step 1: Create the template.**
```tsx
import { Text, Section, Button } from '@react-email/components'
import { Base } from './base'

export const PASSWORD_RESET = 'password-reset'

export interface PasswordResetData { emailOptions: Record<string, unknown>; resetLink: string; preview?: string }
export const isPasswordResetData = (d: any): d is PasswordResetData =>
  d && typeof d === 'object' && typeof d.resetLink === 'string'

export const PasswordResetTemplate = ({ resetLink, preview = 'Reset your Wheel Builds password' }: PasswordResetData) => (
  <Base preview={preview}>
    <Section>
      <Text>We received a request to reset your Wheel Builds password.</Text>
      <Button href={resetLink} style={{ background: '#111', color: '#fff', padding: '12px 20px', borderRadius: 6 }}>Reset password</Button>
      <Text>If you didn't request this, you can safely ignore this email. This link expires shortly.</Text>
    </Section>
  </Base>
)

PasswordResetTemplate.PreviewProps = { resetLink: 'https://example.com/us/reset-password?token=abc&email=test%40example.com', preview: 'Reset your Wheel Builds password' } as PasswordResetData
export default PasswordResetTemplate
```

- [ ] **Step 2: Register key + case** in `templates/index.tsx` (same pattern as Task 4 Step 2).

- [ ] **Step 3: Create the subscriber.** `backend/src/subscribers/auth-password-reset.ts` — Medusa v2 emits `auth.password_reset` with `{ entity_id (email), token }`:
```ts
import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Modules } from '@medusajs/framework/utils'
import { EmailTemplates } from '../modules/email-notifications/templates'
import { EMAIL_REPLY_TO, STOREFRONT_URL } from '../lib/constants'

export default async function passwordResetHandler({ event: { data }, container }: SubscriberArgs<{ entity_id: string; token: string; actor_type?: string }>) {
  // Only customers reset via the storefront link; admin/user resets use the admin app.
  if (data.actor_type && data.actor_type !== 'customer') return
  const notificationModuleService = container.resolve(Modules.NOTIFICATION)
  const email = data.entity_id
  const resetLink = `${STOREFRONT_URL}/us/reset-password?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(email)}`
  try {
    await notificationModuleService.createNotifications({
      to: email,
      channel: 'email',
      template: EmailTemplates.PASSWORD_RESET,
      data: { emailOptions: { replyTo: EMAIL_REPLY_TO || undefined, subject: 'Reset your Wheel Builds password' }, resetLink, preview: 'Reset your Wheel Builds password' },
    })
  } catch (error) {
    console.error('Error sending password reset notification:', error)
  }
}

export const config: SubscriberConfig = { event: 'auth.password_reset' }
```
(Confirm the payload shape against the installed `@medusajs/auth` version — `entity_id` = the identifier/email, `token` = the reset token. `actor_type` may be absent; the guard is defensive.)

- [ ] **Step 4: Verify.**
Run: `cd backend && pnpm email:dev` → `password-reset` renders with a working button. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit.**
```bash
git add backend/src/modules/email-notifications/templates/password-reset.tsx backend/src/modules/email-notifications/templates/index.tsx backend/src/subscribers/auth-password-reset.ts
git commit -m "feat(wb-078): password-reset template + auth.password_reset subscriber"
```

---

## Task 6: Storefront — forgot-password page + action

**Files:**
- Modify: `storefront/src/lib/data/customer.ts` (add `forgotPassword`)
- Create: `storefront/src/app/[countryCode]/(main)/forgot-password/page.tsx`
- Create: `storefront/src/modules/account/components/forgot-password/index.tsx`
- Modify: `storefront/src/modules/account/components/login/index.tsx` (link)

**Interfaces:**
- Produces: `forgotPassword(_state, formData): Promise<string | undefined>` — returns an error string on failure; on success returns a sentinel handled by the form to show the neutral "email is on its way" state. No redirect (stays on page).

- [ ] **Step 1: Write the action.** In `customer.ts` (`"use server"`), mirror `login`'s return-string shape but never reveal account existence:
```ts
export async function forgotPassword(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  try {
    await sdk.auth.resetPassword("customer", "emailpass", { identifier: email })
  } catch (error: any) {
    // Swallow — never reveal whether the account exists (no enumeration).
    console.error("forgotPassword:", error?.toString?.())
  }
  return "SENT" // neutral sentinel; the form renders the same copy regardless
}
```

- [ ] **Step 2: Create the form component.** `storefront/src/modules/account/components/forgot-password/index.tsx` (`"use client"`), model on `login/index.tsx`:
```tsx
"use client"
import { useFormState } from "react-dom"
import { forgotPassword } from "@lib/data/customer"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

export default function ForgotPassword({ countryCode }: { countryCode: string }) {
  const [state, formAction] = useFormState(forgotPassword, null)
  if (state === "SENT") {
    return <div className="max-w-sm w-full flex flex-col items-center">
      <h1 className="text-large-semi uppercase mb-2">Check your email</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">If that account exists, a password reset link is on its way.</p>
      <a href={`/${countryCode}/account`} className="underline">Back to sign in</a>
    </div>
  }
  return (
    <div className="max-w-sm w-full flex flex-col items-center">
      <h1 className="text-large-semi uppercase mb-6">Reset your password</h1>
      <form action={formAction} className="w-full">
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <SubmitButton className="w-full mt-6">Send reset link</SubmitButton>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Create the route.** `storefront/src/app/[countryCode]/(main)/forgot-password/page.tsx`:
```tsx
import ForgotPassword from "@modules/account/components/forgot-password"

export default async function ForgotPasswordPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  return <div className="flex justify-center py-12"><ForgotPassword countryCode={countryCode} /></div>
}
```
(Match the repo's Next 15 param convention — confirm whether `params` is a Promise in this codebase and mirror it.)

- [ ] **Step 4: Add the "Forgot password?" link** in `login/index.tsx`, near the "Not a member? Join us" toggle (~lines 55-64):
```tsx
<a href={`/${countryCode}/forgot-password`} className="text-ui-fg-interactive underline text-small-regular">Forgot password?</a>
```
(The login form already has `countryCode` available via its hidden input / props — reuse it.)

- [ ] **Step 5: Verify.**
Run: `cd storefront && npx tsc --noEmit` (no new errors beyond baseline). Drive: `/us/forgot-password` renders, submitting any email shows the neutral "check your email" state; the login page shows the link.

- [ ] **Step 6: Commit.**
```bash
git add storefront/src/lib/data/customer.ts "storefront/src/app/[countryCode]/(main)/forgot-password" storefront/src/modules/account/components/forgot-password storefront/src/modules/account/components/login/index.tsx
git commit -m "feat(wb-078): storefront forgot-password page + action + login link"
```

---

## Task 7: Storefront — reset-password page + action

**Files:**
- Modify: `storefront/src/lib/data/customer.ts` (add `resetPassword`)
- Create: `storefront/src/app/[countryCode]/(main)/reset-password/page.tsx`
- Create: `storefront/src/modules/account/components/reset-password/index.tsx`

**Interfaces:**
- Produces: `resetPassword(_state, formData): Promise<string | undefined>` — reads `token`, `email`, `password`, `confirm`; returns an error string on mismatch/failure; `redirect()`s to login on success (outside try/catch).

- [ ] **Step 1: Write the action.** In `customer.ts`:
```ts
export async function resetPassword(_currentState: unknown, formData: FormData) {
  const token = formData.get("token") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const confirm = formData.get("confirm") as string
  const countryCode = (formData.get("countryCode") as string) || "us"
  if (!token || !email) return "This reset link is invalid or has expired."
  if (password !== confirm) return "Passwords do not match."
  try {
    await sdk.auth.updateProvider("customer", "emailpass", { email, password }, token)
  } catch (error: any) {
    return error?.toString?.() ?? "Could not reset your password. The link may have expired."
  }
  redirect(`/${countryCode}/account?reset=1`)
}
```

- [ ] **Step 2: Create the form component.** `storefront/src/modules/account/components/reset-password/index.tsx` (`"use client"`), reads token+email from props (passed by the page from searchParams), hidden inputs feed the action:
```tsx
"use client"
import { useFormState } from "react-dom"
import { resetPassword } from "@lib/data/customer"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import ErrorMessage from "@modules/checkout/components/error-message"
import Input from "@modules/common/components/input"

export default function ResetPassword({ token, email, countryCode }: { token: string; email: string; countryCode: string }) {
  const [message, formAction] = useFormState(resetPassword, null)
  return (
    <div className="max-w-sm w-full flex flex-col items-center">
      <h1 className="text-large-semi uppercase mb-6">Choose a new password</h1>
      <form action={formAction} className="w-full">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="countryCode" value={countryCode} />
        <Input label="New password" name="password" type="password" autoComplete="new-password" required />
        <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
        <ErrorMessage error={message} />
        <SubmitButton className="w-full mt-6">Reset password</SubmitButton>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Create the route** (reads `token`+`email` from the URL):
```tsx
import ResetPassword from "@modules/account/components/reset-password"

export default async function ResetPasswordPage({ params, searchParams }: { params: Promise<{ countryCode: string }>; searchParams: Promise<{ token?: string; email?: string }> }) {
  const { countryCode } = await params
  const { token = "", email = "" } = await searchParams
  return <div className="flex justify-center py-12"><ResetPassword token={token} email={email} countryCode={countryCode} /></div>
}
```

- [ ] **Step 4: Success toast on login.** Confirm the account page (or login template) reads `?reset=1` (or `?reset=success`) and shows a success toast/message. If no such hook exists, add a small client toast in the account landing. (Keep scope minimal — a one-line sonner toast on mount when the param is present.)

- [ ] **Step 5: Verify.**
Run: `cd storefront && npx tsc --noEmit`. Drive `/us/reset-password?token=x&email=a%40b.com` — mismatched passwords show the error; a valid token roundtrip (from a real reset email in live verify) routes to login.

- [ ] **Step 6: Commit.**
```bash
git add storefront/src/lib/data/customer.ts "storefront/src/app/[countryCode]/(main)/reset-password" storefront/src/modules/account/components/reset-password
git commit -m "feat(wb-078): storefront reset-password page + action"
```

---

## Task 8: Account "change password" → reset-email button (D4)

**Files:**
- Modify: `storefront/src/modules/account/components/profile-password/index.tsx`

**Interfaces:**
- Consumes: `forgotPassword` (Task 6).

- [ ] **Step 1: Replace the dead form** with a button that triggers the reset flow for the logged-in customer's own email:
```tsx
"use client"
import { useFormState } from "react-dom"
import { forgotPassword } from "@lib/data/customer"
import { SubmitButton } from "@modules/checkout/components/submit-button"

export default function ProfilePassword({ customer }: { customer: { email: string } }) {
  const [state, formAction] = useFormState(forgotPassword, null)
  return (
    <div className="w-full">
      <h3 className="text-large-semi">Password</h3>
      {state === "SENT" ? (
        <p className="text-base-regular mt-2">We've emailed {customer.email} a link to reset your password.</p>
      ) : (
        <form action={formAction} className="mt-2 flex items-center gap-4">
          <input type="hidden" name="email" value={customer.email} />
          <p className="text-base-regular">Send a password reset link to {customer.email}.</p>
          <SubmitButton>Send reset email</SubmitButton>
        </form>
      )}
    </div>
  )
}
```
(Confirm the component's export name + the props the account settings page passes — the current file misnames the component `ProfileName` and passes `{ customer }`; keep the same import site working. Rename the default export but update the import in the account profile template if needed.)

- [ ] **Step 2: Verify.**
Run: `cd storefront && npx tsc --noEmit`. Drive the account "password" section → clicking the button shows the sent-confirmation state.

- [ ] **Step 3: Commit.**
```bash
git add storefront/src/modules/account/components/profile-password/index.tsx
git commit -m "feat(wb-078): account change-password becomes reset-email button (D4)"
```

---

## Task 9: End-to-end verify

- [ ] **Step 1: Dev template render.** `cd backend && pnpm email:dev` → all 4 templates (order-placed, invite-user, shipping-confirmation, password-reset) render.
- [ ] **Step 2: Backend build.** `cd backend && npx tsc --noEmit` (only the B11 baseline error, addressed separately in WB-079) and `pnpm build` clean.
- [ ] **Step 3: Live roundtrips** (against a backend with `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set + verified sender domain):
  - Place a test order → order-confirmation email arrives; Reply-To shows `EMAIL_REPLY_TO` (or no Reply-To if unset).
  - Fulfill + ship in admin → shipping-confirmation email arrives with tracking.
  - `/us/forgot-password` → email → click reset link → `/us/reset-password` → set new password → routed to login → sign in with the new password succeeds.
  - Account "password" section → "Send reset email" → email arrives.
- [ ] **Step 4: Prod enablement note (ops):** set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (+ optional `EMAIL_REPLY_TO`, `STOREFRONT_URL`) on the Railway backend; verify the from-domain in Resend; if the notification module doesn't register, `rm -rf backend/.medusa/server` and redeploy.

## Self-review checklist (author, before handoff)

- P0 #2 (emails don't send) — Tasks 1-4 (env docs + reply-to + shipping) ✅ · P0 #3 (no password reset) — Tasks 5-8 ✅
- D4 reset-email button — Task 8 ✅
- Every new Server Action returns strings / redirects outside try-catch — Tasks 6-7 ✅
- New subscribers use the global container + `query.graph` — Tasks 4-5 ✅
- `EMAIL_REPLY_TO`/`STOREFRONT_URL` created in constants AND `.env.template` — Task 1 ✅
- Reply-to omitted when unset — Task 2 ✅
- Note: confirm the exact `shipment.created` event name + `auth.password_reset` payload against installed module versions during Task 4/5 (flagged in-line).
