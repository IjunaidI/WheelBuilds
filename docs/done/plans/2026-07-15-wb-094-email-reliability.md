# WB-094 Email Reliability — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Backend `email-notifications` module. Spec: [../specs/2026-07-15-wb-094-email-reliability-design.md](../specs/2026-07-15-wb-094-email-reliability-design.md).

**Global constraints:** Backend tests `npx -y pnpm@9.10.0 test:sync` (+ any email-module jest) and `npx medusa build` (exit 0). `resend.emails.send()` **resolves** `{data, error}` — it does NOT reject on API failures. Only a THROWN rejection sets `NotificationStatus.FAILURE` (verified in the installed `@medusajs/notification@2.13.6`). `@react-email/components@1.0.12` has **no `Table`** — use `Row`/`Column` (they render `<table role="presentation">`/`<td>`). Money in Medusa = MAJOR units (dollars) — `Intl.NumberFormat` directly, no `/100`. Branch `feat/g11-wave3-transact-account`.

---

### Task 1: A1 — fail loud on a Resend API error
**Files:** `backend/src/modules/email-notifications/services/resend.ts` (~97-110). Test: a new/extended jest spec for the provider.
- [ ] Failing test: stub `resend.emails.send` to resolve `{ data: null, error: { name: "validation_error", message: "..." } }` → the provider THROWS a `MedusaError` (today it returns `{}` and logs "Successfully sent"). Also: a successful `{ data: {id}, error: null }` → resolves normally.
- [ ] RED → implement:
```ts
const { error } = await this.resend.emails.send(message)
if (error) {
  throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE,
    `Resend rejected "${notification.template}" to ${notification.to}: ${error.name ?? "error"} — ${error.message ?? "unknown"}`)
}
this.logger_.log(`Successfully sent "${notification.template}" email to ${notification.to} via Resend`)
return {}
```
Keep a `try/catch` ONLY for genuine transport throws (rethrow as MedusaError); **remove the SendGrid-shaped `error.response.body.errors[0]` parsing** (Resend never produces that shape).
- [ ] GREEN jest; `npx medusa build` exit 0.
- [ ] Commit `fix(WB-094): fail loud when Resend rejects a send (A1)`.

---

### Task 2: A7 — branded base, formatted money, Outlook-safe items, order link
**Files:** `templates/base.tsx` (header/footer + a `branded`/`variant` opt-out), `templates/order-placed.tsx` (~50 total, ~74-103 flex-div item list, ~100 line price), `templates/shipping-confirmation.tsx` (~113-140 item list), `templates/invite-user.tsx` (~40-44) + `templates/password-reset.tsx` (~43-47) — REMOVE their now-duplicate inline wordmark `<Section>`s; `templates/vendor-sync-alert.tsx` — opt OUT of branding (internal ops email); new `templates/format-usd.ts`; the subscribers `src/subscribers/order-placed.ts` + `shipment-created.ts` (pass the order id / storefront URL into `data`). `STOREFRONT_URL` is already exported from `src/lib/constants.ts` (~103) and already used by `auth-password-reset.ts` (~58) with a prod-localhost guard — mirror that.
- [ ] Failing test: a pure `formatUsd(1479.96)` → `"$1,479.96"` (major units, no /100); `formatUsd(0)` → `"$0.00"`.
- [ ] RED → implement `format-usd.ts` (`Intl.NumberFormat("en-US", {style:"currency", currency:"USD"})`). Then:
  - `base.tsx`: a Wheel Builds text-logo header + a footer (support link, © line); an optional `branded?: boolean` (default true) that `vendor-sync-alert` passes `false` (internal ops email — no customer chrome).
  - `order-placed.tsx`: replace `{...raw_current_order_total.value} {currency_code}` and `{item.unit_price} {currency_code}` with `formatUsd(...)`; convert the flex-div item rows to `<Row>/<Column>`; add a **"View your order" `<Button>`** → `${STOREFRONT_URL}/order/confirmed/${order.id}` (confirm the storefront route is `/order/confirmed/[id]` and takes the order **id**).
  - `shipping-confirmation.tsx`: `<Row>/<Column>` item list + the same "View your order" button. (It renders no money — no formatUsd needed.)
  - Remove the duplicate inline wordmark `<Section>`s from `invite-user.tsx` + `password-reset.tsx` (base now supplies the header).
  - Subscribers: pass whatever the templates need (order id / URL) into the `createNotifications` `data` payload; mirror `auth-password-reset.ts`'s `STOREFRONT_URL` usage + its prod-localhost guard.
- [ ] GREEN jest (snapshot/assert the branded header + formatted money + the order link); `npx medusa build` exit 0.
- [ ] Commit `feat(WB-094): branded email base, formatted money, Outlook-safe items, View-your-order link (A7)`.

---

### Task 3: order.canceled coverage + honest reset-expiry copy
**Files:** new `templates/order-canceled.tsx` + `src/subscribers/order-canceled.ts`; `templates/index.tsx` (~9-15 the `EmailTemplates` enum + ~19-72 the `generateEmailTemplate` switch + its `isXData` type guard); `templates/password-reset.tsx` (~77-80 "This link expires shortly").
- [ ] Failing test: `generateEmailTemplate(EmailTemplates.ORDER_CANCELED, data)` renders the template (and an unknown template still throws as today).
- [ ] RED → implement: `EmailTemplates.ORDER_CANCELED` + an `order-canceled.tsx` template (mirror `order-placed`'s structure/branding: what was canceled, the order id, "no charge / your refund is on its way" — **only state what's true**; if refund status isn't in the payload, say "contact us" rather than promising a refund timeline) + an `isOrderCanceledData` guard + the switch case; a `src/subscribers/order-canceled.ts` on the `order.canceled` event mirroring `order-placed.ts` (same `try/catch` + `console.error` shape).
  - `password-reset.tsx`: replace "This link expires shortly" with the real **15 minutes** (verified: core-flows hard-codes `expiresIn: "15m"`).
- [ ] GREEN jest; `npx medusa build` exit 0 (confirms the subscriber registers).
- [ ] Commit `feat(WB-094): order.canceled email + honest 15-minute reset expiry`.
