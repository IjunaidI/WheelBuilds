# WB-093 Account Truth — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront (+1 backend env). Spec: [../specs/2026-07-15-wb-093-account-truth-design.md](../specs/2026-07-15-wb-093-account-truth-design.md).

**Global constraints:** Storefront tests `npx vitest run <path>` (import `{describe,it,expect}`; 5-error tsc baseline); backend `npx medusa build`. Account modules are legacy Medusa-UI (outside `.frame`) — match their local style, don't WB-ify. **WB-092 (already on this branch) owns the shared `shipping-details`/`payment-details` bug fixes — do NOT re-patch those lines; this chunk MOUNTS PaymentDetails in the ACCOUNT order-detail template + adds fulfillment/tracking.** Branch `feat/g11-wave3-transact-account`.

---

### Task 1: A2 — billing address that actually saves
**Files:** `lib/data/customer.ts` (new `updateCustomerBillingAddress`), `modules/account/components/profile-billing-address/index.tsx` (~37-40 binds the wrong action; fields named `billing_address.*` at ~96-164), `modules/account/components/overview/index.tsx` (~138-166 `getProfileCompletion` awards the 4th point on an `is_default_billing` address). Test: the payload builder.
- [ ] Failing test: a pure `billingAddressPayload(formData)` reads the `billing_address.*`-prefixed names (currently `updateCustomerAddress` reads UNPREFIXED, so every field is null) and sets `is_default_billing: true`.
- [ ] RED → implement: a dedicated `updateCustomerBillingAddress` action — find the existing `is_default_billing` address (`customer.addresses?.find(a => a.is_default_billing)`); if found → `sdk.store.customer.updateAddress(id, {...fields, is_default_billing:true})`, else → `createAddress({...fields, is_default_billing:true})`. Do NOT wrap the general `updateCustomerAddress` (it has no billing awareness and would clobber the flag on unrelated edits). Bind the form to it. Profile completion then reaches 100%.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-093): billing address saves via a dedicated find-or-create action (A2)`.

---

### Task 2: A3/A12/A14 — honest email field, phone editor, copy sweep
**Files:** `modules/account/components/profile-email/index.tsx` (~19-34 fake-success stub), `profile-phone/index.tsx` (~52 renders literal "null", ~63 `type="phone"` invalid, ~65 `required`), `modules/account/components/account-info/index.tsx` (~85 "succesfully" typo — shared, shows on EVERY field save), `modules/account/components/order-card/index.tsx` (~46 slices 3 but ~67 gates on `>4` and ~69 computes `numberOfLines - 4` = quantity math, not product count), `modules/account/components/order-overview/index.tsx` (~32 "let us change that :)").
- [ ] Failing test: a pure `hiddenProductCount(items, shown)` → the real count of hidden PRODUCTS (not summed quantity), and the gate matches the slice.
- [ ] RED → implement: replace the fake-success email form with a read-only field + "contact us to change your login email" (delete the commented-out `updateCustomer` stub + import). Phone: `type="tel"`, drop `required`, render `customer.phone ?? ""` (never the string "null"). Fix the "succesfully" typo; fix order-card's `+N more` (gate + count both from the real hidden-product count, matching the slice); reword the "let us change that :)" empty state.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-093): read-only email field, tel phone editor, order-card count + copy sweep (A3/A12/A14)`.

---

### Task 3: A4/A11 — real order status + tracking
**Files:** `lib/data/orders.ts` (~8-17 `retrieveOrder` fields = `*payment_collections.payments` only), `modules/order/components/order-details/index.tsx` (~10-14 dead `formatStatus`, ~39-57 commented-out status renders), `modules/order/templates/order-details-template.tsx` (~37-41 — mount `PaymentDetails`, which is built but NOT mounted here), `app/[countryCode]/(main)/account/@dashboard/orders/page.tsx` (~23-26 promises returns/exchanges). Test: a tracking/status formatter.
- [ ] Failing test: a pure `trackingLinks(fulfillments)` → `{number, url}[]` from `fulfillments[].labels[]`; `formatStatus` renders a real label.
- [ ] RED → implement: `retrieveOrder` fields gain `*fulfillments,*fulfillments.labels` (verified `FulfillmentDTO` carries `shipped_at`/`delivered_at`, `FulfillmentLabelDTO` carries `tracking_number`/`tracking_url`). `order-details` re-enables `formatStatus` for fulfillment + payment status and renders tracking numbers/links (link when `tracking_url` present). **Mount `<PaymentDetails>` in `order-details-template`** (it's already built + the field is already fetched). The orders-page copy stops promising returns/exchanges → point at `/returns` + `/contact` (WB-103 builds the real self-serve flow later).
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-093): real order/payment status + tracking + mount PaymentDetails + honest returns copy (A4/A11)`.

---

### Task 4: A5/A6 — route integrity + orders pagination
**Files:** new `app/[countryCode]/(main)/account/@login/default.tsx` + `@dashboard/default.tsx`; `lib/data/orders.ts` (~19-27 `listOrders(limit=10, offset=0)`, no count returned), `app/[countryCode]/(main)/account/@dashboard/orders/page.tsx` (~13 calls with no args), `modules/account/components/order-overview/index.tsx` (add a pager). Test: the offset math.
- [ ] Failing test: a pure `ordersPageParams(page, limit)` → `{limit, offset}` (page 1 → offset 0; page 3, limit 10 → offset 20); clamp page ≥ 1.
- [ ] RED → implement: add `default.tsx` for BOTH parallel-route slots (`@login` re-exports its page or renders null; `@dashboard` likewise) so a hard nav to any nested dashboard route (`/account/profile`, `/account/orders/details/:id`) stops 404ing. Thread `?page=` → `listOrders(limit, offset)` returning `{orders, count}`; the orders page `await`s Next-15 `searchParams`; render the standard pager.
- [ ] GREEN vitest; `tsc`; `npx next build` compiles. Commit `fix(WB-093): parallel-route defaults + orders pagination (A5/A6)`.

---

### Task 5: A8/A9/A10/A15 — dead links + auth hygiene
**Files:** `modules/account/templates/account-layout.tsx` (~33-35 `/customer-service`), `modules/account/components/register/index.tsx` (~65-72 password no minLength; ~78,85 `/content/privacy-policy`,`/content/terms-of-use`), `modules/account/components/reset-password/index.tsx` (~34-49 password fields), `lib/data/customer.ts` (~145-151 `signout`: un-awaited `removeAuthToken()`, dead `revalidateTag("auth")`; + `signup`/`resetPassword` server-side length check), `backend/medusa-config.js` (~99-105 `http` block — add `jwtExpiresIn`). Test: the password rule.
- [ ] Failing test: a pure `passwordError(pw)` → an error string under 8 chars, null at ≥8.
- [ ] RED → implement: repoint `/customer-service` → `/contact`; register consent → `/privacy` + `/terms`. `minLength={8}` + helper copy on register/reset inputs **AND** a server-side `passwordError` check in the `signup`/`resetPassword` actions (verified `@medusajs/auth-emailpass` does NOT enforce length — the storefront must). `signout`: `await removeAuthToken()` before `redirect()`; delete the dead `revalidateTag("auth")` (nothing is tagged "auth"). Backend `medusa-config.js` `http` gains `jwtExpiresIn: "7d"` to match the 7-day cookie (Medusa 2.13.6's default is `"1d"` — verified in the installed framework source — so sessions silently die on day 2).
- [ ] GREEN vitest; `tsc`; `cd backend && npx medusa build` exit 0. Grep: no `/customer-service`, no `/content/`. Commit `fix(WB-093): dead links, password rules, awaited signout, jwtExpiresIn 7d (A8/A9/A10/A15)`.
