# WB-002 · Authed garage mutations resolve by `client_id` — Design

> Status: design · Branch: `fix/garage-authed-mutations` · Date: 2026-06-18
> Backlog: [WB-002](../../future/BACKLOG.md) (BLOCKER)

## Problem

A logged-in customer's garage **rename / delete / set-active all 404**. List and create work,
which masks the break.

The `customer_vehicle` model carries two identifiers
([model](../../../backend/src/modules/customer-vehicle/models/customer-vehicle.ts)):

- `id` — Medusa PK (e.g. `cusveh_01J…`)
- `client_id` — the storefront's `crypto.randomUUID()`, with a **unique index on `(customer_id, client_id)`**

The round-trip breaks because the two sides disagree on which identifier the `[id]` route segment carries:

| Step | Behavior | Ref |
|---|---|---|
| Storefront `add()` | Generates a client UUID, stores it as the Vehicle's `id`, sends it as `client_id`. | [medusa-garage.ts:54,58](../../../storefront/src/lib/garage/medusa-garage.ts) |
| `fromWire()` | Surfaces `id: r.client_id ?? r.id` — the in-memory Vehicle id is the **client_id**; the Medusa PK is never seen by the storefront. | [medusa-garage.ts:15](../../../storefront/src/lib/garage/medusa-garage.ts) |
| `update` / `remove` / `setActive` | Send that client_id as the URL `[id]`. | [medusa-garage.ts:67,76,81](../../../storefront/src/lib/garage/medusa-garage.ts) |
| Backend `[id]` routes | `owned()` resolves by **PK**: `listCustomerVehicles({ id, customer_id })`. A client_id never matches → **404**. `activate` likewise misses, and its inner `updateCustomerVehicles` would no-op on a PK miss. | [\[id\]/route.ts:4-5](../../../backend/src/api/store/customer/vehicles/[id]/route.ts) · [activate/route.ts:8](../../../backend/src/api/store/customer/vehicles/[id]/activate/route.ts) |

`list` (GET) and `create` (POST) work because neither resolves by the `[id]` segment.

## Approach (chosen: A)

**A — Backend resolves the `[id]` segment as the `client_id`.** Resolve the row by
`(client_id, customer_id)` → real PK → mutate by PK. **Zero storefront changes.**

Rejected **B — storefront sends the server PK**: `add()` is optimistic/fire-and-forget, so the
Vehicle enters state with a temp client UUID before the create POST resolves; using the PK as the id
would require reconciling the temp id with the server PK after the round-trip, remapping `activeId`,
and handling mutations issued before create settles. It also diverges the two garage providers'
id semantics (`LocalStorageGarage` keys on client UUIDs). More moving parts, both apps change, for
no benefit.

## Contract

The `[id]` path segment of the three authed vehicle routes is **defined as the `client_id`**, not the
Medusa PK. Resolution is always scoped to the authenticated customer; `(customer_id, client_id)` is a
unique index, so it identifies exactly one row and ownership falls out of the same query.

The route folder stays `[id]` (renaming to `[clientId]` is pure churn with no functional gain); a route
comment documents that the segment is the client_id.

## Changes

### Backend — the only side that changes

1. **Service** — [customer-vehicle/service.ts](../../../backend/src/modules/customer-vehicle/service.ts): add one resolver.
   ```ts
   async resolveOwned(customerId: string, clientId: string): Promise<any | undefined> {
     const [row] = await this.listCustomerVehicles({ customer_id: customerId, client_id: clientId })
     return row // undefined when missing or not owned by this customer
   }
   ```
   `activate(pkId, customerId)` is unchanged — it correctly mutates by PK internally once handed a real PK.

2. **[\[id\]/route.ts](../../../backend/src/api/store/customer/vehicles/[id]/route.ts)** — POST (update) + DELETE.
   Replace the `owned()` helper with `resolveOwned(customerId, id)`. On a hit, mutate by the resolved
   **`row.id`** (real PK): `updateCustomerVehicles({ id: row.id, … })` / `deleteCustomerVehicles(row.id)`.
   On a miss → `404 not_found`.

3. **[\[id\]/activate/route.ts](../../../backend/src/api/store/customer/vehicles/[id]/activate/route.ts)**.
   `resolveOwned(customerId, id)` → 404 on miss → `activate(row.id, customerId)`.

### Storefront — none

It already sends client_id as `[id]` and surfaces client_id as the Vehicle id via `fromWire`.
`LocalStorageGarage` keys on client UUIDs too, so both garage providers keep identical id semantics —
nothing downstream shifts.

## Error handling

- Unknown or foreign `client_id` → `404 not_found` (ownership preserved by the customer-scoped query).
- Unauthenticated → `401 unauthorized` (unchanged).
- No behavior change to GET (list) or POST (create) on the collection route.

## Testing (TDD — write failing first)

- **Service unit tests**, in the existing
  [service.test.ts](../../../backend/src/modules/customer-vehicle/__tests__/service.test.ts) harness style:
  - `resolveOwned` returns the row for the matching `(customer_id, client_id)`.
  - returns `undefined` for an unknown `client_id`.
  - returns `undefined` for another customer's `client_id` (cross-tenant isolation).
- **Live API round-trip smoke** against a running backend (as WB-001 was verified): authed
  create → update (rename) → activate → delete, asserting each survives a re-`list` — proving the
  404s are gone end-to-end.

## Out of scope

- WB-022 — atomic guest→login garage merge.
- WB-007 — `hub_bore_mm` INTEGER truncation.
- Renaming the `[id]` route folder to `[clientId]`.

## Verification (acceptance)

A logged-in user can rename, delete, and set-active a vehicle, and each change survives a page reload.
