# Plan 2 — Garage Hardening Implementation Plan

> **✅ STATUS — DONE & merged to `main`** (prior session; fast-forward `3ca3f04`→`69a0a95`, commits `3d81afc`→`b7fc3d1`→`69a0a95`, local). DB-level single-active partial unique index (`Migration20260602090000`, **applied to prod DB**), `service.createForCustomer` invariant + zod body validation, and the merge-on-login duplicate-row race fixed (`MedusaGarage.ready()` + `planMerge`). Backend 6 + storefront 4 new unit tests green.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three correctness gaps in the (otherwise working) garage: make single-active-vehicle enforced at the database level, stop `POST` from creating an active vehicle that bypasses the invariant (and validate the request body), and fix the merge-on-login race that inserts duplicate vehicle rows.

**Architecture:** The garage already works end-to-end (guest localStorage + authed Medusa CRUD + merge-on-login). These are hardening changes, not new features. We add a partial unique index as the real single-active guarantee, move the create/invariant logic into the service so it is unit-testable and the route stays thin, and make the login merge await the remote garage's initial load before deduping so it can never merge against an empty list.

**Tech Stack:** MedusaJS 2.13.6 (MikroORM migrations, Jest + @swc/jest, zod already a dependency), Next.js 15 / React 19 storefront (Vitest 2.1.9).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/src/modules/customer-vehicle/migrations/Migration20260602090000.ts` | Partial unique index `(customer_id) WHERE is_active` + dedup of existing actives | Create |
| `backend/src/api/store/customer/vehicles/validators.ts` | Pure zod schema + `parseVehicleCreate` | Create |
| `backend/src/api/store/customer/vehicles/__tests__/validators.test.ts` | Jest for the validator | Create |
| `backend/src/modules/customer-vehicle/service.ts` | Add `createForCustomer` (idempotent, always inactive) | Modify |
| `backend/src/modules/customer-vehicle/__tests__/service.test.ts` | Add invariant tests for `createForCustomer` | Modify |
| `backend/src/api/store/customer/vehicles/route.ts` | Validate body + call `createForCustomer` (drop `is_active` passthrough) | Modify |
| `storefront/src/lib/garage/medusa-garage.ts` | Expose `ready()` / `isLoaded()`; track `loadOk` | Modify |
| `storefront/src/lib/garage/merge.ts` | Add pure `planMerge(local, remote, loadOk)` | Modify |
| `storefront/src/lib/garage/merge.test.ts` | Add `planMerge` tests | Modify |
| `storefront/src/lib/garage/index.ts` | Await `remote.ready()`; merge via `planMerge`; clear only when loaded | Modify |

---

### Task 1: Enforce single-active at the database level

**Files:**
- Create: `backend/src/modules/customer-vehicle/migrations/Migration20260602090000.ts`

**Why:** `activate()` enforces single-active only in application code via N+1 separate updates with no transaction (`service.ts:6-12`), and `POST` can create an active row directly. A partial unique index makes "at most one active vehicle per customer" a hard DB guarantee; concurrent activations then fail loudly instead of silently producing two active rows. `activate()` already deactivates others **before** activating the target, so it never violates the index within a single request.

> This index is intentionally raw SQL (a partial index on a boolean condition is not expressible in the model DSL), so it is NOT reflected in `.snapshot-customer-vehicle-module.json` and `medusa db:generate` will not manage it. That mirrors how the existing migration hand-writes its partial indexes.

- [ ] **Step 1: Create the migration**

Create `backend/src/modules/customer-vehicle/migrations/Migration20260602090000.ts`:

```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260602090000 extends Migration {

  override async up(): Promise<void> {
    // 1. Collapse any pre-existing multiple-active rows down to the most recent
    //    one per customer, so the unique index can be created without conflict.
    this.addSql(`
      UPDATE "customer_vehicle" cv SET "is_active" = false
      WHERE cv."is_active" = true AND cv."deleted_at" IS NULL
        AND cv."id" <> (
          SELECT c2."id" FROM "customer_vehicle" c2
          WHERE c2."customer_id" = cv."customer_id"
            AND c2."is_active" = true AND c2."deleted_at" IS NULL
          ORDER BY c2."updated_at" DESC, c2."id" DESC
          LIMIT 1
        );
    `);

    // 2. At most one active, non-deleted vehicle per customer.
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_vehicle_one_active"
      ON "customer_vehicle" ("customer_id")
      WHERE "is_active" AND "deleted_at" IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "UQ_customer_vehicle_one_active";`);
  }

}
```

- [ ] **Step 2: Run the migration**

Run (from `backend/`): `npx medusa db:migrate`
Expected: output lists `Migration20260602090000` as run, no errors.
(If `medusa` is not on PATH, use `node_modules/.bin/medusa.CMD db:migrate` — see root CLAUDE.md.)

- [ ] **Step 3: Verify the index exists**

Run a psql check against `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -c "\di+ UQ_customer_vehicle_one_active"
```

Expected: one row showing the index on `customer_vehicle`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/customer-vehicle/migrations/Migration20260602090000.ts
git commit -m "feat(garage): DB-level single-active vehicle via partial unique index"
```

---

### Task 2: Validate the create body and enforce the invariant in the service

**Files:**
- Create: `backend/src/api/store/customer/vehicles/validators.ts`
- Test: `backend/src/api/store/customer/vehicles/__tests__/validators.test.ts`
- Modify: `backend/src/modules/customer-vehicle/service.ts`
- Modify: `backend/src/modules/customer-vehicle/__tests__/service.test.ts`
- Modify: `backend/src/api/store/customer/vehicles/route.ts`

**Why:** `POST` reads `req.body as any` with no validation and forwards `is_active: !!b.is_active` (`route.ts:16`), so a client can create a second active vehicle directly, and a malformed payload can insert a partial row. We add a zod schema (which omits `is_active` entirely) and move create into a service method that is idempotent and always creates inactive.

- [ ] **Step 1: Write the failing validator test**

Create `backend/src/api/store/customer/vehicles/__tests__/validators.test.ts`:

```ts
import { parseVehicleCreate } from "../validators"

describe("parseVehicleCreate", () => {
  it("accepts a well-formed vehicle", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, make: "Ford", model: "F-150", trim: "XLT" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.make).toBe("Ford")
  })
  it("rejects a missing make", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, model: "F-150" })
    expect(r.ok).toBe(false)
  })
  it("strips is_active so a client cannot create an active vehicle", () => {
    const r = parseVehicleCreate({ client_id: "c1", year: 2021, make: "Ford", model: "F-150", is_active: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect("is_active" in r.data).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `npx jest src/api/store/customer/vehicles/__tests__/validators.test.ts`
Expected: FAIL — cannot find module `../validators`.

- [ ] **Step 3: Write the validator**

Create `backend/src/api/store/customer/vehicles/validators.ts`:

```ts
import { z } from "zod"

/**
 * Body accepted by POST /store/customer/vehicles. `is_active` is deliberately
 * NOT a field: vehicles are always created inactive and made active only via
 * POST .../[id]/activate, which keeps the single-active invariant intact.
 */
export const VehicleCreateSchema = z.object({
  client_id: z.string().min(1),
  year: z.number().int().gte(1900).lte(2100),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().nullish(),
  modificationSlug: z.string().nullish(),
  canonicalBoltPatterns: z.array(z.string()).nullish(),
  hubBoreMm: z.number().nullish(),
  diameterWindow: z.any().nullish(),
  widthWindow: z.any().nullish(),
  offsetWindow: z.any().nullish(),
  fitmentStatus: z.string().nullish(),
  notes: z.string().nullish(),
})

export type VehicleCreateInput = z.infer<typeof VehicleCreateSchema>

export type ParseResult =
  | { ok: true; data: VehicleCreateInput }
  | { ok: false; error: string }

export function parseVehicleCreate(body: unknown): ParseResult {
  const r = VehicleCreateSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}
```

- [ ] **Step 4: Run the validator test to verify it passes**

Run (from `backend/`): `npx jest src/api/store/customer/vehicles/__tests__/validators.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Write the failing service-invariant test**

Append to `backend/src/modules/customer-vehicle/__tests__/service.test.ts` (extend the existing `makeService` helper to also stub `createCustomerVehicles`):

```ts
describe("createForCustomer enforces the invariant", () => {
  function makeCreateService() {
    const rows: any[] = []
    const svc = new (CustomerVehicleService as any)({})
    svc.listCustomerVehicles = async (f: any) =>
      rows.filter(r => r.customer_id === f.customer_id && (f.client_id === undefined || r.client_id === f.client_id))
    svc.createCustomerVehicles = async (data: any) => { const row = { id: `id_${rows.length}`, ...data }; rows.push(row); return row }
    return { svc, rows }
  }

  it("always creates inactive even if is_active is somehow passed", async () => {
    const { svc } = makeCreateService()
    const v = await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150", is_active: true } as any)
    expect(v.is_active).toBe(false)
  })

  it("is idempotent on (customer_id, client_id)", async () => {
    const { svc, rows } = makeCreateService()
    await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150" })
    const again = await svc.createForCustomer("c1", { client_id: "k1", year: 2021, make: "Ford", model: "F-150" })
    expect(rows.length).toBe(1)
    expect(again.client_id).toBe("k1")
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run (from `backend/`): `npx jest src/modules/customer-vehicle/__tests__/service.test.ts`
Expected: FAIL — `svc.createForCustomer is not a function`.

- [ ] **Step 7: Implement `createForCustomer`**

In `backend/src/modules/customer-vehicle/service.ts`, add the method inside the class (after `activate`):

```ts
// backend/src/modules/customer-vehicle/service.ts
import { MedusaService } from "@medusajs/framework/utils"
import CustomerVehicle from "./models/customer-vehicle"

class CustomerVehicleService extends MedusaService({ CustomerVehicle }) {
  async activate(id: string, customerId: string): Promise<void> {
    const active = await this.listCustomerVehicles({ customer_id: customerId, is_active: true })
    for (const v of active) {
      if (v.id !== id) await this.updateCustomerVehicles({ id: v.id, is_active: false })
    }
    await this.updateCustomerVehicles({ id, is_active: true })
  }

  /**
   * Idempotent create on (customer_id, client_id). Always inactive — making a
   * vehicle active goes through activate(), preserving the single-active
   * invariant (and the DB partial unique index).
   */
  async createForCustomer(customerId: string, input: any): Promise<any> {
    const existing = await this.listCustomerVehicles({ customer_id: customerId, client_id: input.client_id })
    if (existing[0]) return existing[0]
    return this.createCustomerVehicles({
      customer_id: customerId,
      client_id: input.client_id,
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim ?? null,
      modification_slug: input.modificationSlug ?? null,
      is_active: false,
      canonical_bolt_patterns: input.canonicalBoltPatterns ?? null,
      hub_bore_mm: input.hubBoreMm ?? null,
      diameter_window: input.diameterWindow ?? null,
      width_window: input.widthWindow ?? null,
      offset_window: input.offsetWindow ?? null,
      fitment_status: input.fitmentStatus ?? null,
      notes: input.notes ?? null,
    })
  }
}
export default CustomerVehicleService
```

- [ ] **Step 8: Run the service test to verify it passes**

Run (from `backend/`): `npx jest src/modules/customer-vehicle/__tests__/service.test.ts`
Expected: PASS — the original single-active test plus the two new ones.

- [ ] **Step 9: Wire the POST route to validate + use the service**

Replace the `POST` handler in `backend/src/api/store/customer/vehicles/route.ts` (leave `GET` and the `actor` helper unchanged):

```ts
import { parseVehicleCreate } from "./validators"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const customerId = actor(req); if (!customerId) { res.status(401).json({ error: "unauthorized" }); return }
  const parsed = parseVehicleCreate(req.body)
  if (!parsed.ok) { res.status(400).json({ error: "invalid_vehicle", details: parsed.error }); return }
  const svc = req.scope.resolve(CUSTOMER_VEHICLE_MODULE) as any
  const vehicle = await svc.createForCustomer(customerId, parsed.data)
  res.status(201).json({ vehicle })
}
```

> Add `import { parseVehicleCreate } from "./validators"` to the top of the file alongside the existing imports.

- [ ] **Step 10: Commit**

```bash
git add backend/src/api/store/customer/vehicles/validators.ts backend/src/api/store/customer/vehicles/__tests__/validators.test.ts backend/src/modules/customer-vehicle/service.ts backend/src/modules/customer-vehicle/__tests__/service.test.ts backend/src/api/store/customer/vehicles/route.ts
git commit -m "feat(garage): validate create body + enforce inactive-on-create via service.createForCustomer"
```

---

### Task 3: Fix the merge-on-login duplicate-row race

**Files:**
- Modify: `storefront/src/lib/garage/medusa-garage.ts`
- Modify: `storefront/src/lib/garage/merge.ts`
- Modify: `storefront/src/lib/garage/merge.test.ts`
- Modify: `storefront/src/lib/garage/index.ts`

**Why:** `RoutingGarage.mergeLocalIntoRemote` (`index.ts:34-39`) reads `this.remote.list()` to build the dedup set, but `MedusaGarage` populates that list asynchronously in its constructor (`void this.load()`), and `syncAuth` does not await it. Under latency (or a swallowed `load()` failure) the remote list is empty at merge time, the dedup is bypassed, and because re-added vehicles get fresh `client_id`s, the server's `(customer_id, client_id)` idempotency guard and unique index both miss — producing duplicate rows. Fix: await the remote's initial load, and never merge unless that load succeeded.

- [ ] **Step 1: Write the failing test for `planMerge`**

Append to `storefront/src/lib/garage/merge.test.ts`:

```ts
import { planMerge } from "./merge"

describe("planMerge", () => {
  it("returns [] when the remote load did not succeed (never merge into an unknown account)", () => {
    const local = [v(2021, "Ford", "F-150", "XLT")]
    expect(planMerge(local, [], false)).toEqual([])
  })
  it("dedupes against the loaded remote when load succeeded", () => {
    const local = [v(2021, "Ford", "F-150", "XLT"), v(2018, "Jeep", "Wrangler")]
    const remote = [v(2021, "ford", "f-150", "xlt")]
    expect(planMerge(local, remote, true).map((x) => x.model)).toEqual(["Wrangler"])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `storefront/`): `npx vitest run src/lib/garage/merge.test.ts`
Expected: FAIL — `planMerge` is not exported.

- [ ] **Step 3: Add `planMerge` to merge.ts**

Append to `storefront/src/lib/garage/merge.ts`:

```ts
/**
 * Decide which local vehicles to push into the account on login. Returns []
 * unless the remote garage's initial load succeeded — merging against an
 * unread account would re-add everything under fresh client_ids and duplicate
 * rows that the (customer_id, client_id) guard cannot catch.
 */
export function planMerge(local: Vehicle[], remote: Vehicle[], loadOk: boolean): NewVehicle[] {
  if (!loadOk) return []
  return vehiclesToMerge(local, remote)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `storefront/`): `npx vitest run src/lib/garage/merge.test.ts`
Expected: PASS — original `vehiclesToMerge` tests plus the two new `planMerge` tests.

- [ ] **Step 5: Expose `ready()` / `isLoaded()` on MedusaGarage**

In `storefront/src/lib/garage/medusa-garage.ts`, replace the constructor and `load()` (lines 22-38) with:

```ts
export class MedusaGarage implements GarageProvider {
  private vehicles: Vehicle[] = []
  private activeId: string | null = null
  private listeners = new Set<() => void>()
  private loaded: Promise<void>
  private loadOk = false

  constructor() {
    this.loaded = typeof window !== "undefined" ? this.load() : Promise.resolve()
  }

  /** Resolves once the initial account load has settled (success or failure). */
  ready(): Promise<void> { return this.loaded }
  /** True only if the initial account load actually succeeded. */
  isLoaded(): boolean { return this.loadOk }

  private emit() { this.listeners.forEach((l) => l()) }
  private async load() {
    try {
      const { vehicles } = await api.listVehicles()
      this.vehicles = vehicles.map(fromWire)
      const active = vehicles.find((v: any) => v.is_active)
      this.activeId = active ? (active.client_id ?? active.id) : (this.vehicles[0]?.id ?? null)
      this.loadOk = true
      this.emit()
    } catch { this.loadOk = false /* stay empty on failure; toast handled by callers */ }
  }
```

(Leave the rest of the class — `list`, `getActive`, `add`, `update`, `remove`, `setActive`, `subscribe` — unchanged.)

- [ ] **Step 6: Await the load and merge via planMerge in RoutingGarage**

In `storefront/src/lib/garage/index.ts`: change the import on line 6 from `vehiclesToMerge` to `planMerge`:

```ts
import { planMerge } from "./merge"
```

Replace `syncAuth` (lines 20-32) and `mergeLocalIntoRemote` (lines 34-39):

```ts
  /** Called on boot and after the login/logout Server Actions complete. */
  async syncAuth(): Promise<void> {
    let authed = false
    try { authed = !!(await getCustomer()) } catch { authed = false }
    if (authed) {
      if (!this.remote) this.remote = new MedusaGarage()
      await this.remote.ready()                       // wait for the account to load before merging
      if (!this.merged && this.remote.isLoaded()) {
        await this.mergeLocalIntoRemote()
        this.merged = true
      }
      this.current = this.remote
    } else {
      this.current = this.local
      this.merged = false
    }
    this.emit()
  }

  private async mergeLocalIntoRemote() {
    if (!this.remote) return
    const toAdd = planMerge(this.local.list(), this.remote.list(), this.remote.isLoaded())
    for (const nv of toAdd) this.remote.add(nv) // re-add through remote (mints client_id; idempotent server-side)
    if (this.remote.isLoaded()) this.local.clear() // only drop local once we know the account state
  }
```

- [ ] **Step 7: Type-check and commit**

Run (from `storefront/`): `npx vitest run src/lib/garage/merge.test.ts` (still green) and `npx tsc --noEmit` (no new errors in garage files).

```bash
git add storefront/src/lib/garage/medusa-garage.ts storefront/src/lib/garage/merge.ts storefront/src/lib/garage/merge.test.ts storefront/src/lib/garage/index.ts
git commit -m "fix(garage): await remote load before login-merge to stop duplicate vehicle rows"
```

---

## Self-Review Notes

- **Spec coverage:** DB single-active (Task 1), create-invariant + body validation (Task 2), merge race (Task 3) — the three garage gaps from the audit.
- **Type consistency:** `parseVehicleCreate(body): { ok: true; data } | { ok: false; error }`; `createForCustomer(customerId, input)` returns the row; `planMerge(local, remote, loadOk): NewVehicle[]` wraps the existing `vehiclesToMerge`; `MedusaGarage.ready(): Promise<void>` / `isLoaded(): boolean` are new public methods used by `RoutingGarage`.
- **Manual check worth doing once:** log in as a customer with local guest vehicles on a throttled network and confirm exactly one row per vehicle in `customer_vehicle` (no duplicates) and exactly one `is_active = true`.
- **Note on `activate()` atomicity:** the partial unique index (Task 1) is the guarantee; `activate()` keeps its deactivate-others-then-activate order so it never trips the index in a single request. Wrapping `activate()` in an explicit DB transaction is a possible follow-up but not required once the index exists.
