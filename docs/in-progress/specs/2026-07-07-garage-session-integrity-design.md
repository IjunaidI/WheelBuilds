# Garage session integrity — one customer, one garage, loud failures (G9 cluster 4) — Design

> Status: **in-progress** (spec). Session = epic **G9** (audit remediation), cluster **garage-session-integrity**.
> Proposed backlog id: **WB-073** (under the WB-069 umbrella).
> Remediates **10 findings** (fitment-garage log #3,4,5,13,14,15,16,17,24,25), all re-verified against current
> `main` 2026-07-07 — **all HOLD** (WB-022/032/tire-arc touched adjacent code, never these paths).
> Governing dashboard: [docs/STATUS.md](../../STATUS.md) · Backlog: [docs/future/BACKLOG.md](../../future/BACKLOG.md)
> Umbrella: [docs/future/plans/2026-07-06-audit-remediation-theme.md](../../future/plans/2026-07-06-audit-remediation-theme.md)
> Raw findings: [audit-findings-fitment-garage.md](../../future/plans/2026-07-06-audit-findings-fitment-garage.md)

## 1. Context

The "garage" (a customer's saved vehicles + the active one that drives fitment) has a guest path
(localStorage) and an authed path (Medusa `customer_vehicle`), bridged by a `RoutingGarage` singleton
(`storefront/src/lib/garage/index.ts`) that swaps between a `LocalStorageGarage` and a `MedusaGarage` on
auth change and merges guest→authed on login (WB-022). The audit found the abstraction **treats "authed" as
a boolean rather than a customer identity**, and treats **every authed write as fire-and-forget** — so it
leaks one customer's garage to the next, misses updates after an auth swap, and silently loses/desyncs data.

All 10 findings are single-reviewer PENDING; re-verification against current `main` confirmed **all hold**.
The remediation principle (G9 theme): **the garage shown always belongs to the current customer, writes are
ordered and their failures are surfaced (never silently swallowed), and an auth/merge transition never loses
a vehicle or leaks another customer's.**

### The findings this cluster closes

| # | Sev | One-line | Where |
|---|---|---|---|
| G1 | HIGH | `RoutingGarage.subscribe` pins listeners to the mount-time provider → components miss updates after an auth swap | `lib/garage/index.ts` |
| G2 | HIGH | logout→login-as-different-customer shows the PREVIOUS customer's garage (stale in-memory `remote`) | `lib/garage/index.ts` |
| G3 | HIGH | authed YMM add fires create+activate+fitment concurrently, unordered → activate/update hit a not-yet-created vehicle (404, swallowed) | `search/.../ymm-pane.tsx` + `medusa-garage.ts` |
| G4 | MED | `activate()` is a non-transactional read-modify-write → concurrent activates 500 on the one-active unique index | `customer-vehicle/service.ts` |
| G5 | MED | every authed garage mutation is `.catch(() => {})` → a failed write is invisible, optimistic state diverges | `medusa-garage.ts` |
| G6 | MED | a failed initial authed load renders an EMPTY garage (looks like data loss), no retry | `medusa-garage.ts` + account garage |
| G7 | MED | a vehicle added during the login merge window is wiped by `local.clear()` (TOCTOU; WB-022 narrowed, didn't close) | `lib/garage/index.ts` |
| G8 | MED | YMM submit has no catch for non-503 errors → unhandled rejection, drawer stuck, half-added vehicle | `ymm-pane.tsx` + `garage-pane.tsx` |
| G9 | LOW | merge/create routes accept an unbounded vehicle array | `customer-vehicle/validators.ts` |
| G10 | LOW | deleting the last/active vehicle leaves a stale `?fit` filtering against a vehicle that no longer exists | `discovery/.../fitment-sync` |

### Current-state facts (grounded, re-verified 2026-07-07)

| Fact | Evidence |
|---|---|
| `subscribe(l)` binds `l` to `this.current` at subscribe time; per-provider `emit` fans out the provider's OWN listener set; the master set is only fanned once per auth transition in `syncAuth`. `useGarage`'s subscribe is a stable module ref (React never re-subscribes). | [index.ts:51-55](../../../storefront/src/lib/garage/index.ts#L51), [use-garage.ts:41](../../../storefront/src/lib/garage/use-garage.ts#L41) |
| logout sets `current=local; merged=false` but never nulls `remote`; next login reuses the SAME `MedusaGarage` (holding customer A's vehicles); `ready()` resolves instantly (no refetch); `mergeFrom` early-returns on empty guest local (no refresh); `current=remote` set unconditionally. | [index.ts:24,30-33](../../../storefront/src/lib/garage/index.ts#L24), [medusa-garage.ts:64-65](../../../storefront/src/lib/garage/medusa-garage.ts#L64) |
| YMM add: `add({...})` → `void api.createVehicle` (fire-and-forget); `setActive(id)` → `void api.activateVehicle` same tick (unawaited); `update(id, fitment)` after the fitment await. Backend activate 404s if the create INSERT hasn't landed; client `.catch(()=>{})` swallows it. | [ymm-pane.tsx:201-221](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L201), [medusa-garage.ts:84,107](../../../storefront/src/lib/garage/medusa-garage.ts#L84) |
| `activate` = list active → loop deactivate → update one active (un-transacted). DB enforces `UQ_customer_vehicle_one_active` (partial unique) so a race 500s (not silent corruption). | [customer-vehicle/service.ts:18-24](../../../backend/src/modules/customer-vehicle/service.ts#L18), [Migration20260602090000.ts:22-24](../../../backend/src/modules/customer-vehicle/migrations/Migration20260602090000.ts#L22) |
| `add/update/remove/setActive` all `.catch(() => {})` — no retry, no toast, no rollback. | [medusa-garage.ts:84,95,102,107](../../../storefront/src/lib/garage/medusa-garage.ts#L84) |
| `load()`'s catch sets `loadOk=false` and does NOT emit; `vehicles` stays `[]`. `GarageManager` renders `length===0` as "No vehicles saved yet" — indistinguishable from a failed load. No consumer checks `isLoaded()`. | [medusa-garage.ts:42-51](../../../storefront/src/lib/garage/medusa-garage.ts#L42), [account/.../garage/index.tsx:64-68](../../../storefront/src/modules/account/components/garage/index.tsx#L64) |
| `syncAuth` snapshots `toAdd` synchronously, `await remote.mergeFrom(toAdd)`, then `if (ok) local.clear()`; `current` isn't reassigned to `remote` until after the method returns, so an `add()` during the await lands in `local` and is then wiped by `clear()` (removes both keys, no diff). WB-022 fixed the old N-POST/clear-before-persist bug; this TOCTOU remains. | [index.ts:37-43](../../../storefront/src/lib/garage/index.ts#L37), [local-storage-garage.ts:113-119](../../../storefront/src/lib/garage/local-storage-garage.ts#L113) |
| `getFitmentByVehicle` maps only HTTP 503 → `{error}`; other statuses `throw`. `ymm-pane submit` wraps the call in `try { } finally { setSubmitting(false) }` — NO catch; a non-503 throw = unhandled rejection, `onClose`/`router.push` never run, vehicle already added+activated with no fitment. `garage-pane.selectVehicle` has the identical gap. | [ymm-pane.tsx:194-256](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx#L194), [fitment.ts:82-99](../../../storefront/src/lib/data/fitment.ts#L82), [garage-pane.tsx:63-110](../../../storefront/src/modules/search/components/search-drawer/find-by-vehicle/garage-pane.tsx#L63) |
| `VehicleMergeSchema = z.object({ vehicles: z.array(VehicleCreateSchema) })` — no `.max()`; `mergeForCustomer` loops with no per-customer cap. | [validators.ts:59-61](../../../backend/src/api/store/customer/vehicles/validators.ts#L59) |
| `FitmentSync` bails when `active` is null (`if (!desiredFit) return`) — removing the last vehicle never strips `fit/fitb/fitd/fitw/fito`; grid stays filtered against an absent vehicle. Comment: auto-strip was removed to avoid a boot-flicker while the garage loads async. | [discovery/.../fitment-sync/index.tsx:16-27](../../../storefront/src/modules/discovery/components/fitment-sync/index.tsx#L16) |

## 2. Goals / non-goals

**Goals**
- The garage shown always belongs to the current customer; logout→login-as-another never leaks the prior garage (G2), and a mounted component always reflects the active provider after an auth swap (G1).
- Authed writes are ordered (create before activate/update) (G3) and atomic where they must be (activate) (G4); a failed write surfaces (toast + rollback), never a silent `.catch(()=>{})` (G5, G8); a failed load shows an error/retry, not a fake-empty garage (G6).
- An auth/merge transition never loses a vehicle added mid-flight (G7) and never leaks another customer's.
- Bounded batch sizes (G9); removing the last vehicle clears the now-orphaned `?fit` (G10).

**Non-goals**
- No garage feature additions (plate→YMM WB-058, wishlist, etc.).
- No change to the guest LocalStorageGarage's data model or the `customer_vehicle` schema (no migration).
- The other two G9 clusters (discovery-honest-signals, docs-truth-sweep) — separate specs.

## 3. Chosen approach

The root of G1+G2 is that `RoutingGarage` keys on an **authed boolean** instead of a **customer identity +
generation**. The fixes cluster into: (A) identity-correct provider lifecycle, (B) ordered + atomic writes,
(C) loud failures, (D) bounded/consistent edges. Pure logic (the merge-diff, the activate query, the schema
cap) is unit-tested; the provider lifecycle + components ride on `vitest` + `tsc` + review.

**Decisions (made now for batch approval — flag any you'd change):**
- **G1/G2 (identity lifecycle):** `syncAuth` tracks the **customer id**. On a customer-id change (incl.
  logout→null and login-as-different), **null and rebuild `remote`** (fresh `MedusaGarage` → fresh `load()`),
  and **re-point all tracked listeners** to the new `current` provider (subscribe re-binds on swap). "Authed"
  becomes "which customer," not a boolean. This is the core fix and closes both HIGHs together.
- **G3 (ordering):** the authed add path **awaits `createVehicle` before** firing `activateVehicle` /
  `update`, while keeping the **optimistic local UI** (still return the vehicle synchronously for render).
- **G4 (atomic activate):** replace the read-loop-write with a **single transaction / conditional UPDATE**
  (`SET is_active=false WHERE customer_id=$c AND id<>$v; SET is_active=true WHERE id=$v`) or catch the
  unique-violation + retry — no zero/two-active race, no 500.
- **G5/G8 (loud failures):** garage mutations and the YMM/garage-pane submit **catch real errors → a `sonner`
  toast + roll back the optimistic local change** (or mark it pending) instead of `.catch(()=>{})`; the YMM
  submit catches non-503 errors, keeps the drawer open, and doesn't leave a half-added vehicle.
- **G6 (honest empty vs failed):** `MedusaGarage` exposes an `isLoaded()`/`loadError` signal; the account
  `GarageManager` and any garage empty-state distinguish **"couldn't load — retry"** from **"genuinely
  empty."**
- **G7 (merge TOCTOU):** `local.clear()` becomes a **diff-clear** — clear only the vehicles that were in the
  merged `toAdd` snapshot (by `client_id`), so an `add()` during the merge window survives and syncs.
  Preserves WB-022's idempotent single-request + stable `client_id` design.
- **G9 (cap):** `VehicleMergeSchema`/create cap the vehicle array at **50** (generous for real households,
  bounded against abuse). App-level only, no migration.
- **G10 (orphaned fit):** when the garage **is loaded** and the active vehicle becomes null/absent (last
  vehicle removed), `FitmentSync` strips `fit`+windows from the URL — gated on `isLoaded()` so the
  boot-flicker the current comment warns about can't recur.

## 4. Interfaces & isolation

Pure / unit-tested:
- The merge diff-clear (`clientIdsToClear(mergedSnapshot)`) and the activate conditional-UPDATE query shape.
- `VehicleMergeSchema.max(50)` (validator).
- Any extracted `resolveCustomerIdentity`/generation helper for the provider lifecycle.

I/O / component (vitest + tsc + review): the `RoutingGarage` lifecycle (index.ts), `MedusaGarage`
load/mutations (error surface + isLoaded), `ymm-pane`/`garage-pane` submit, `FitmentSync`, `GarageManager`.

## 5. Testing

- **Storefront `vitest`:** the merge diff-clear (an add-during-merge client_id is NOT cleared);
  provider-identity lifecycle (customer-id change → remote rebuilt, listeners re-pointed — testable via the
  pure identity helper + a fake provider); the FitmentSync strip-on-empty gated by isLoaded. `merge.ts`
  already has a test to extend.
- **Backend `test:fitment`** (covers `customer-vehicle`): the atomic activate (concurrent activate leaves
  exactly one active, no 500); `VehicleMergeSchema` rejects a >50 batch.
- The provider-lifecycle + component wiring: `tsc` + review (no component test harness exists in the repo).

## 6. Deploy notes

- **No migration, no new env.** All fixes are app-level (storefront lifecycle/components + backend
  service/validator query changes).
- The atomic `activate` (G4) changes the query but not the schema; the `UQ_customer_vehicle_one_active` index
  already exists and stays the invariant.

## 7. Risks & trade-offs

- **G1/G2 provider-lifecycle rework** is the riskiest change (it touches the singleton every garage consumer
  reads). Mitigated by keeping the `GarageProvider` interface stable and unit-testing the identity/generation
  logic; the fix only changes WHEN `remote` is rebuilt and WHEN listeners re-point.
- **G7 diff-clear must not regress WB-022 idempotency** — clear strictly the merged `client_id`s; a vehicle
  added mid-merge simply isn't in that set and stays local until the next sync.
- **G5/G8 rollback** must not fight the optimistic-UI model — on failure, roll back the specific optimistic
  change (or mark it retryable) and toast, rather than reloading the whole garage.
- **G10 strip-on-empty** must stay gated on `isLoaded()` so it never fires during async boot (the exact
  flicker the current code removed the auto-strip to avoid).
