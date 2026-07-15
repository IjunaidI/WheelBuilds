# WB-093 · Account & order-history truth — design

> G11 Wave 3. Findings **A2–A6, A8–A15, C6-shared** ([audit §A](../../future/plans/2026-07-13-ux-completeness-audit.md)).
> Re-verified against current `main` (`a701fb3`) 2026-07-15 — evidence inline. Storefront + one backend env line.
> **C6/A13 order components shared with WB-092 — WB-092 fixes the receipt bugs; WB-093 mounts `PaymentDetails` + adds fulfillment/tracking.**

## Problem
The account section still contains boilerplate that fake-succeeds (email edit, billing address) and hides order status/tracking entirely; the billing-address form is wired to the wrong action so every save fails (profile stuck at 75%); order status/payment status render as empty strings; there's no default.tsx so a hard refresh of a nested dashboard route 404s; order history is hard-capped at 10; several dead links + copy bugs + a JWT-lifetime mismatch that kills the session on day 2.

## Decisions (defaults)
- **A2 billing = a dedicated action.** `updateCustomerBillingAddress` reads `billing_address.*` names, does find-or-create on the `is_default_billing` address (find → update, else create) with `is_default_billing: true` — NOT a wrapper around the general `updateCustomerAddress` (which has no billing awareness and would clobber the flag).
- **A3 email = read-only, not a real flow.** Auth-identity desync makes a real email-change a separate project; replace the fake-success form with a read-only field + "contact us to change your login email".
- **A11 returns copy = honest pointer, not a flow.** The orders-page copy points at `/returns` + `/contact` (WB-103 builds the real self-serve return-request later); stop promising an affordance that doesn't exist.
- **A15 JWT = set `jwtExpiresIn: "7d"`** to match the cookie (Medusa 2.13.6 default is `"1d"` — verified in the installed framework source — so the cookie outlives the token by 6 days today).

## Design (storefront + one backend env)
1. **Billing address (A2).** Dedicated `updateCustomerBillingAddress` action (find-or-create, `is_default_billing: true`); the form binds it with the address id when one exists; profile completion reaches 100%.
2. **Email edit (A3).** Read-only field + "contact us" copy (delete the commented-out fake-success stub).
3. **Order status & tracking (A4, A11).** `retrieveOrder` fields gain `*fulfillments,*fulfillments.labels` (verified `FulfillmentDTO`/`FulfillmentLabelDTO` carry `shipped_at`/`delivered_at`/`tracking_number`/`tracking_url`); `order-details` renders real fulfillment + payment status (re-enable `formatStatus`) + tracking numbers/links; **mount the already-built-but-unmounted `PaymentDetails`** in `order-details-template`; the orders-page copy points at `/returns` + `/contact`.
4. **Route integrity (A5).** Add `account/@login/default.tsx` + `@dashboard/default.tsx` (a hard nav to any nested dashboard route 404s today, regardless of auth state).
5. **Orders pagination (A6).** Thread `?page=` through `listOrders` (limit/offset + count) with the standard pager; the orders page `await`s Next-15 `searchParams`.
6. **Auth hygiene (A9, A10, A15).** `minLength={8}` + helper copy on register/reset **plus a server-side check** in the `signup`/`resetPassword` actions (verified `@medusajs/auth-emailpass` doesn't enforce length); `await removeAuthToken()` in `signout` + drop the dead `revalidateTag("auth")`; set backend `http.jwtExpiresIn: "7d"`.
7. **Fixes & copy (A8, A12, A13/C6, A14).** Repoint `/customer-service` → `/contact` and the register consent `/content/*` → `/privacy` + `/terms`; phone editor `type="tel"`, optional, no literal `"null"` render; the shared `shipping-details`/`payment-details` decimal/guard fixes are **WB-092's** (coordinate — don't double-patch); typo sweep ("succesfully", order-card `+N more` quantity-vs-product math + threshold mismatch, "let us change that :)" empty state).

## Verify
Vitest for the new billing action (find-or-create payload) + pagination (offset math); a smoke: save billing → overview shows it + 100%; order detail shows real fulfillment/payment status + tracking + the mounted PaymentDetails; refresh `/account/profile` then logout → the login form (not a 404). Grep: no `/customer-service` / `/content/` links; no `type="phone"`; no "succesfully".

## Deploy
Storefront rebuild + a backend restart (for `jwtExpiresIn`). No migration.

## Out of scope
The self-serve return-request/reorder flow (WB-103); the cart/checkout receipt-bug fixes (WB-092 owns the shared components); a real email-change flow (auth-identity project).
