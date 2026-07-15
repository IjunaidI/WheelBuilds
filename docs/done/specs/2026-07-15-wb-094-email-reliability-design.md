# WB-094 · Transactional email reliability & coverage — design

> G11 Wave 3. Findings **A1, A7** + coverage gaps (order.canceled, reset-expiry copy) ([audit §A](../../future/plans/2026-07-13-ux-completeness-audit.md)).
> Re-verified against current `main` (`a701fb3`) 2026-07-15 — evidence inline. Backend `email-notifications` module.

## Problem
The Resend provider treats API failures as success — `resend.emails.send()` **resolves** `{data, error}` (never rejects) for a bad key / unverified domain / rate limit, but the provider discards the return and logs "Successfully sent" unconditionally, so password-reset and order emails can silently never send. The order/shipping emails are unbranded, render raw money ("Total: 1479.96 usd"), use flex-div layouts Outlook can't render, and carry NO link back to the store — for a guest, the emailed link is the only route back to their order. And there's no cancellation email at all.

## Decisions (defaults; the flagged optionals)
- **A1 fail loud:** `const { error } = await this.resend.emails.send(message); if (error) throw new MedusaError(...)`. Verified against the installed `@medusajs/notification@2.13.6`: only a **thrown** rejection sets `NotificationStatus.FAILURE` on the persisted row — today every Resend-rejected send is recorded SUCCESS. Every calling subscriber already `try/catch`es `createNotifications`, so throwing won't crash a workflow; it just makes the log + DB state honest. Remove the SendGrid-shaped `error.response.body.errors[0]` catch parsing.
- **A7 tables:** `@react-email/components@1.0.12` has **no `Table`** export — use its `Row`/`Column` (which render `<table role="presentation">`/`<td>`, Outlook-safe).
- **`formatUsd`:** `Intl.NumberFormat("en-US", { style:"currency", currency:"USD" })` on the value directly — `order.summary.raw_current_order_total.value` + `item.unit_price` are MAJOR units (dollars), no `/100`. A local backend helper (module boundary; mirror the storefront `money.ts` shape, not shared code).
- **Base header scope:** when `base.tsx` gains a branded header/footer, **remove the duplicate inline "Wheel Builds" wordmark `<Section>`** from `invite-user.tsx` + `password-reset.tsx` (they'd double-render). `vendor-sync-alert.tsx` is an INTERNAL ops email → give `Base` an optional `branded`/`variant` prop it opts out of (a customer footer on an ops alert is odd).
- **Coverage:** `order.canceled` subscriber + template = **in scope** (a customer must not learn of a cancellation from silence). Welcome-on-register = **deferred/optional** (the merchant may prefer silence — already D-flagged in the consolidated design).

## Design (backend `email-notifications`)
1. **Fail loud (A1).** As above — read `{ error }`, throw `MedusaError` on it; the notification records FAILURE + the ops logs/watchdog see it.
2. **Branded base (A7).** `base.tsx` gains a Wheel Builds text-logo header + a footer (support link → `mailto`/`/contact`, © line); a `Row`/`Column` table-based layout for the order/shipping item lists (Outlook); a `formatUsd` helper replaces every raw `{value} {currency_code}` render in `order-placed.tsx`; a **"View your order" `<Button>`** on order-placed + shipping-confirmation → `${STOREFRONT_URL}/order/confirmed/<id>` (STOREFRONT_URL is already wired + has a prod-localhost guard; this is a guest's primary route back — pairs with WB-097). Remove the now-duplicate inline wordmarks from invite-user/password-reset.
3. **Coverage.** New `order.canceled` subscriber + `order-canceled.tsx` template + an `EmailTemplates.ORDER_CANCELED` enum entry + `generateEmailTemplate` case (mirror the order-placed wiring); the password-reset template states the real **15-minute** expiry (verified `expiresIn: "15m"` in the installed core-flows source — replace the vague "expires shortly").
4. Keep WB-078's no-enumeration + redirect patterns untouched.

## Verify
Jest: the provider throws on `{ error }` (a `{data:null, error:{...}}` from a stubbed `send` → a thrown MedusaError, and the notification would record FAILURE); template snapshots render the branded header + `formatUsd` money + the order-link button; the `order.canceled` subscriber fires the template. Live roundtrip (needs `RESEND_*` set — go-live runbook §1): place a test order → email arrives branded with a working order link + formatted money; a bad `RESEND_FROM_EMAIL` now surfaces a FAILURE (not a false success).

## Deploy
Backend deploy → restart. Requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + a verified Resend sender domain + `STOREFRONT_URL` set on prod (go-live runbook) for emails to actually send — A1 now makes a missing/misconfigured setup **fail loudly** instead of silently.

## Out of scope
Welcome-on-register (deferred/optional); guest order lookup page (WB-097 — this ships the email deep-link half); marketing opt-in (WB-103); double-opt-in/unsubscribe (WB-057).
