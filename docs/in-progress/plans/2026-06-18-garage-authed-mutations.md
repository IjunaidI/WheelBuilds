# WB-002 · Garage authed mutations resolve-by-client_id — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a logged-in customer's garage rename / delete / set-active work (they currently all 404) by resolving the `[id]` route segment as the storefront `client_id` instead of the Medusa PK.

**Architecture:** Backend-only fix (Option A). Add one service resolver, `resolveOwned(customerId, clientId)`, that looks up a row by the unique `(customer_id, client_id)` index. Rewire the three authed `[id]` routes (update, delete, activate) to resolve the row by client_id, 404 on miss, then mutate by the resolved real PK (`row.id`). The storefront is unchanged — it already sends client_id as `[id]` and treats client_id as the Vehicle id.

**Tech Stack:** MedusaJS 2.x (`MedusaService`), TypeScript, Jest (hand-mocked service, no DB), Medusa Store + Auth HTTP API.

**Spec:** [docs/in-progress/specs/2026-06-18-garage-authed-mutations-design.md](../specs/2026-06-18-garage-authed-mutations-design.md)

## Global Constraints

- Run all backend commands from `backend/`.
- `pnpm` may not be on PATH (Windows) — invoke jest directly with `npx jest …`.
- Commit trailer required on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- The `[id]` route folder stays named `[id]`; the segment semantically carries the storefront `client_id`. Document this with a one-line route comment — do **not** rename the folder.
- `MedusaService` update takes a single object: `updateCustomerVehicles({ id, ...fields })` — never the two-arg `(selector, update)` form.
- No storefront changes in this plan.

---

### Task 1: Service resolver `resolveOwned`

**Files:**
- Modify: `backend/src/modules/customer-vehicle/service.ts`
- Test: `backend/src/modules/customer-vehicle/__tests__/service.test.ts`

**Interfaces:**
- Consumes: the `MedusaService`-generated `listCustomerVehicles({ customer_id, client_id })` (filters by the unique `(customer_id, client_id)` index).
- Produces: `resolveOwned(customerId: string, clientId: string): Promise<any | undefined>` — returns the matching row (which carries the real PK `row.id`), or `undefined` when no row matches for that customer. Consumed by all three `[id]` routes in Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/modules/customer-vehicle/__tests__/service.test.ts`:

```ts
describe("resolveOwned scopes by customer + client_id", () => {
  function makeResolveService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    return { svc, rows }
  }

  it("returns the row matching (customer_id, client_id), carrying the real PK", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c1", client_id: "k1" })
    const row = await svc.resolveOwned("c1", "k1")
    expect(row?.id).toBe("pk_1")
  })

  it("returns undefined for an unknown client_id", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c1", client_id: "k1" })
    expect(await svc.resolveOwned("c1", "nope")).toBeUndefined()
  })

  it("returns undefined for another customer's client_id (cross-tenant isolation)", async () => {
    const { svc, rows } = makeResolveService()
    rows.push({ id: "pk_1", customer_id: "c2", client_id: "k1" })
    expect(await svc.resolveOwned("c1", "k1")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/modules/customer-vehicle/__tests__/service.test.ts -t "resolveOwned"`
Expected: FAIL — `svc.resolveOwned is not a function`.

- [ ] **Step 3: Implement `resolveOwned`**

In `backend/src/modules/customer-vehicle/service.ts`, add this method to the `CustomerVehicleService` class (place it above `activate`):

```ts
  /**
   * Resolve a customer's vehicle by its storefront `client_id`. The store
   * `[id]` routes address rows by client_id (the stable, storefront-known id),
   * NOT the Medusa PK. Scoped to `customer_id`, so this also enforces ownership:
   * a foreign or unknown client_id returns undefined. The returned row carries
   * the real PK in `row.id` for the subsequent mutation.
   */
  async resolveOwned(customerId: string, clientId: string): Promise<any | undefined> {
    const [row] = await this.listCustomerVehicles({ customer_id: customerId, client_id: clientId })
    return row
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/modules/customer-vehicle/__tests__/service.test.ts -t "resolveOwned"`
Expected: PASS — 3 passing.

- [ ] **Step 5: Run the full customer-vehicle suite to confirm no regression**

Run: `npx jest src/modules/customer-vehicle`
Expected: PASS — all existing tests (activate, createForCustomer) plus the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/customer-vehicle/service.ts backend/src/modules/customer-vehicle/__tests__/service.test.ts
git commit -m "feat(garage): resolveOwned() resolves a vehicle by client_id (WB-002)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewire the three `[id]` routes to resolve by client_id

**Files:**
- Modify: `backend/src/api/store/customer/vehicles/[id]/route.ts` (POST update + DELETE)
- Modify: `backend/src/api/store/customer/vehicles/[id]/activate/route.ts` (POST activate)

**Interfaces:**
- Consumes: `svc.resolveOwned(customerId, clientId)` from Task 1; existing `updateCustomerVehicles({ id, … })`, `deleteCustomerVehicles(id)`, `activate(pkId, customerId)`.
- Produces: HTTP behavior — these routes now 200 on an owned client_id and 404 on an unknown/foreign one. No new exports. Verified end-to-end by the live smoke in Task 3 (routes are thin HTTP glue; the repo has no route-level unit harness).

- [ ] **Step 1: Rewrite `[id]/route.ts`**

Replace the entire contents of `backend/src/api/store/customer/vehicles/[id]/route.ts` with:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../modules/customer-vehicle"
// NOTE: the [id] path segment is the storefront client_id, not the Medusa PK.
// resolveOwned maps (client_id, customer_id) -> row; we mutate by row.id (real PK).
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params; const b = req.body as any
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const row = await svc.resolveOwned(customerId, id)
  if (!row) { res.status(404).json({ error: "not_found" }); return }
  const vehicle = await svc.updateCustomerVehicles({
    id: row.id, modification_slug: b.modificationSlug, canonical_bolt_patterns: b.canonicalBoltPatterns,
    hub_bore_mm: b.hubBoreMm, diameter_window: b.diameterWindow, width_window: b.widthWindow,
    offset_window: b.offsetWindow, fitment_status: b.fitmentStatus, trim: b.trim, notes: b.notes,
  })
  res.json({ vehicle })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const row = await svc.resolveOwned(customerId, id)
  if (!row) { res.status(404).json({ error: "not_found" }); return }
  await svc.deleteCustomerVehicles(row.id)
  res.status(200).json({ id, deleted: true })
}
```

(`id` in the DELETE response stays the client_id the storefront sent — the storefront keys on client_id.)

- [ ] **Step 2: Rewrite `[id]/activate/route.ts`**

Replace the entire contents of `backend/src/api/store/customer/vehicles/[id]/activate/route.ts` with:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { CUSTOMER_VEHICLE_MODULE } from "../../../../../../modules/customer-vehicle"
// NOTE: the [id] path segment is the storefront client_id, not the Medusa PK.
const actor = (req: MedusaRequest) => (req as any).auth_context?.actor_id as string | undefined

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const { id } = req.params
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const row = await svc.resolveOwned(customerId, id)
  if (!row) { res.status(404).json({ error: "not_found" }); return }
  await svc.activate(row.id, customerId)
  res.json({ id, active: true })
}
```

- [ ] **Step 3: Confirm the service suite still passes (routes import nothing tests touch, but verify no typo in the shared module import)**

Run: `npx jest src/modules/customer-vehicle`
Expected: PASS — unchanged from Task 1.

- [ ] **Step 4: Commit**

```bash
git add "backend/src/api/store/customer/vehicles/[id]/route.ts" "backend/src/api/store/customer/vehicles/[id]/activate/route.ts"
git commit -m "fix(garage): resolve authed vehicle [id] routes by client_id, mutate by PK (WB-002)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Live API round-trip smoke + close-out

**Files:**
- Create (temporary, not committed): `backend/scratch-wb002-smoke.mjs`
- Modify: `docs/future/BACKLOG.md` (WB-002 → done)
- Modify: `docs/STATUS.md` (Garage pillar line + Active work + Last verified)
- Move: `docs/in-progress/specs/2026-06-18-garage-authed-mutations-design.md` → `docs/done/specs/`
- Move: `docs/in-progress/plans/2026-06-18-garage-authed-mutations.md` → `docs/done/plans/`

**Interfaces:**
- Consumes: a running backend on `:9000` with a seeded DB and a publishable API key; the routes from Task 2.
- Produces: a documented green acceptance run (create → update → activate → delete, each surviving a re-list) and synced docs. Terminal deliverable for WB-002.

- [ ] **Step 1: Ensure a backend is running with a known publishable key**

In one shell: `cd backend && npx medusa develop` (or `pnpm dev`). Wait for `:9000` to respond.
Get a publishable key: from the admin (`/app` → Settings → Publishable API Keys) or reuse the storefront's `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in `storefront/.env.local`. Export it as `PUBKEY` for Step 2.

- [ ] **Step 2: Write the smoke script**

Create `backend/scratch-wb002-smoke.mjs` (a scratch file — deleted in Step 5, never committed):

```js
// WB-002 acceptance smoke: authed garage create -> update -> activate -> delete.
// Run: node scratch-wb002-smoke.mjs   (backend must be up on :9000)
const BASE = "http://localhost:9000"
const PUBKEY = process.env.PUBKEY
if (!PUBKEY) throw new Error("set PUBKEY env to a publishable API key")
const email = `wb002+${Date.now()}@example.com`, password = "Passw0rd!"
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const H = (token) => ({ "content-type": "application/json", "x-publishable-api-key": PUBKEY, ...(token ? { authorization: `Bearer ${token}` } : {}) })

// 1) register + login a customer -> JWT for auth_context.actor_id
let reg = await j(await fetch(`${BASE}/auth/customer/emailpass/register`, { method: "POST", headers: H(), body: JSON.stringify({ email, password }) }))
let token = reg.token
const me = await fetch(`${BASE}/store/customers`, { method: "POST", headers: H(token), body: JSON.stringify({ email }) })
if (!me.ok) console.log("customer create:", await j(me))

const list = async () => (await j(await fetch(`${BASE}/store/customer/vehicles`, { headers: H(token) }))).vehicles ?? []
const clientId = `smoke_${Date.now()}`

// CREATE
await fetch(`${BASE}/store/customer/vehicles`, { method: "POST", headers: H(token), body: JSON.stringify({ client_id: clientId, year: 2021, make: "Ford", model: "F-150" }) })
console.log("after create:", (await list()).map(v => ({ client_id: v.client_id, notes: v.notes, is_active: v.is_active })))

// UPDATE (rename via notes) — the operation that used to 404
const upd = await fetch(`${BASE}/store/customer/vehicles/${clientId}`, { method: "POST", headers: H(token), body: JSON.stringify({ notes: "renamed-by-smoke" }) })
console.log("update status:", upd.status)

// ACTIVATE — used to 404
const act = await fetch(`${BASE}/store/customer/vehicles/${clientId}/activate`, { method: "POST", headers: H(token) })
console.log("activate status:", act.status)
console.log("after update+activate:", (await list()).map(v => ({ client_id: v.client_id, notes: v.notes, is_active: v.is_active })))

// DELETE — used to 404
const del = await fetch(`${BASE}/store/customer/vehicles/${clientId}`, { method: "DELETE", headers: H(token) })
console.log("delete status:", del.status)
console.log("after delete (expect empty):", (await list()).map(v => v.client_id))

// 404 PROOF: a bogus client_id must 404
const ghost = await fetch(`${BASE}/store/customer/vehicles/does-not-exist`, { method: "POST", headers: H(token), body: JSON.stringify({ notes: "x" }) })
console.log("bogus client_id update status (expect 404):", ghost.status)
```

- [ ] **Step 3: Run the smoke and confirm the acceptance criteria**

Run: `cd backend && PUBKEY=<key> node scratch-wb002-smoke.mjs`
Expected:
- `update status: 200`, `activate status: 200`, `delete status: 200`.
- "after update+activate" shows `notes: "renamed-by-smoke"` and `is_active: true` for the vehicle.
- "after delete" prints an empty list.
- "bogus client_id update status (expect 404): 404".

If any mutation returns 404, Task 2 is wrong — stop and re-check `resolveOwned` wiring before proceeding.

- [ ] **Step 4: Close out the backlog + STATUS**

In `docs/future/BACKLOG.md`, set WB-002 `status: done` and append a `- done:` line:
```
- done: [id] routes resolve by client_id via resolveOwned(); mutate by real PK. Storefront unchanged. Verified by service unit tests (cross-tenant isolation) + live create→update→activate→delete smoke (bogus id 404s).
```

In `docs/STATUS.md`:
- Bump `> **Last verified: 2026-06-18.**` (keep today's date).
- Garage pillar row: change `working-with-gaps · 1 blocker` → `working-with-gaps`, and the one-liner from `Authed mutations 404 (PK vs client_id).` → `Authed mutations resolve by client_id (WB-002 done).` Remove `WB-002` from that row's Open backlog cell.
- Active work block: replace with `None in progress. **WB-002** (authed garage mutations) shipped to \`main\`. Next up: **WB-003** (PDP variant grid collapses bolt patterns) or **WB-009** (PDP fitment).`
- Bump Storefront/Backend test counts only if they changed (backend gains 3 → update the Tests line).

- [ ] **Step 5: Delete the scratch smoke file and move the docs**

```bash
rm backend/scratch-wb002-smoke.mjs
git mv docs/in-progress/specs/2026-06-18-garage-authed-mutations-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-06-18-garage-authed-mutations.md docs/done/plans/
```

- [ ] **Step 6: Commit the close-out**

```bash
git add docs/
git commit -m "docs: close WB-002 (authed garage mutations resolve by client_id) — backlog, STATUS, move spec+plan to done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Service `resolveOwned` resolver → Task 1. ✓
- Three `[id]` routes resolve by client_id, mutate by PK, 404 on miss → Task 2. ✓
- Storefront unchanged → no task touches storefront. ✓
- Contract: `[id]` segment = client_id, folder not renamed, documented in route comment → Task 2 comments. ✓
- Testing: service unit tests (match + unknown + cross-tenant) → Task 1; live round-trip smoke → Task 3. ✓
- Error handling: 404 on unknown/foreign, 401 unauthed unchanged → preserved in Task 2 rewrites + asserted in Task 3. ✓
- Acceptance (rename/delete/activate survive reload) → Task 3 re-list assertions stand in for reload (server state is the source of truth). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full file/method content. ✓

**Type consistency:** `resolveOwned(customerId, clientId) → row|undefined` defined in Task 1, consumed identically in Task 2; mutations use `row.id` (real PK) consistently; `updateCustomerVehicles({ id, … })` single-object form per Global Constraints. ✓
