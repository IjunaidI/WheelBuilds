# Garage session integrity (WB-073) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** One customer ↔ one garage: never leak the prior customer's garage, keep mounted components in sync after an auth swap, order + make-atomic authed writes, surface (not swallow) write/load failures, and never lose a vehicle across a merge.

**Architecture:** Storefront `RoutingGarage` singleton keyed by customer identity (rebuild `remote` + re-point listeners on customer change); ordered/atomic writes; toast+rollback on failure; diff-clear on merge; bounded batches; strip orphaned `?fit`. Backend: atomic activate + a batch cap.

**Tech Stack:** Next.js 15 / React 19 storefront (vitest, sonner toasts), MedusaJS 2.13.6 (`test:fitment` covers `customer-vehicle`).

**Spec:** [docs/in-progress/specs/2026-07-07-garage-session-integrity-design.md](../specs/2026-07-07-garage-session-integrity-design.md)

## Global Constraints
- Storefront cmds from `storefront/`; backend from `backend/`. `npx -y pnpm@9.10.0` if pnpm missing.
- Storefront gate: `npx vitest run` green + `npx tsc --noEmit` no NEW errors beyond the ~14 baseline (storefront/CLAUDE.md). `build:next` needs a live backend — do NOT run.
- Backend gate: `pnpm test:fitment` + `pnpm test:sync` green + `medusa build` exit 0.
- No migration, no new env. Keep the `GarageProvider` interface stable; keep WB-022's idempotent merge (stable `client_id = vehicle.id`, `(customer_id, client_id)` create guard).
- Toasts via the existing `sonner`/`toast` used elsewhere in the storefront (grep for the current import).
- Commit `fix(garage): <what> (WB-073 G<n>)` + trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Provider identity lifecycle — rebuild `remote` on customer change + re-point listeners (G1 + G2, HIGH)

**Files:** Modify `storefront/src/lib/garage/index.ts` (RoutingGarage: `syncAuth`, `subscribe`). Test: `storefront/src/lib/garage/__tests__/routing-identity.test.ts` (new).

- [ ] **Step 1 — read** `index.ts` fully: `syncAuth`, `subscribe`, the `remote`/`local`/`current`/`merged`/`listeners` fields, and how `syncAuth` learns the auth state (customer id source — a prop/arg or a fetch). Confirm the shapes vs the spec's current-state table.
- [ ] **Step 2 — failing test** (`routing-identity.test.ts`): using a fake `MedusaGarage` factory, assert: (a) `syncAuth(customerA)` then `syncAuth(customerB)` builds a NEW remote for B (A's vehicles never shown to B); (b) `syncAuth(null)` (logout) nulls remote so a later `syncAuth(customerB)` refetches; (c) a listener subscribed before an auth swap receives the post-swap provider's emits.
- [ ] **Step 3 — implement:** track `remoteCustomerId` (or a generation counter). In `syncAuth(customerId)`: if `customerId !== remoteCustomerId` → `this.remote = customerId ? new MedusaGarage(...) : null`, `remoteCustomerId = customerId`, reset `merged=false`, and (re)load. On logout (`customerId == null`) set `current=local`. On swap, **re-point every tracked master listener**: after reassigning `this.current`, for each listener call the new provider's `subscribe` and drop the old binding (keep a `Map<listener, off>` so `subscribe` and the swap both maintain it). Emit once after the swap so `useSyncExternalStore` re-reads.
- [ ] **Step 4:** run the new test + full `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): rebuild garage on customer change + re-point listeners (WB-073 G1/G2)`.

### Task 2: Order the authed add — await create before activate/update (G3, HIGH)

**Files:** Modify `storefront/src/lib/garage/medusa-garage.ts` (add/activate/update) and/or `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` (the add path).

- [ ] **Step 1 — read** the YMM add path (`ymm-pane.tsx:201-221`) + `medusa-garage.ts` `add`/`activateVehicle`/`update`. Confirm the unawaited fire-and-forget sequence.
- [ ] **Step 2 — implement:** keep the optimistic local `add()`/`setActive()` for instant UI, but sequence the NETWORK calls: `await api.createVehicle(...)` must resolve before `api.activateVehicle(id)` and the later fitment `update(id, ...)` fire. Simplest: chain them in `MedusaGarage` (e.g. a per-vehicle promise the activate/update await), or have the add path `await` create then activate then update. Do NOT block the synchronous UI return. Ensure the created vehicle's server id is used for activate/update (client_id = vehicle.id keeps them addressable).
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): order authed add — create before activate/update (WB-073 G3)`.

### Task 3: Atomic `activate()` (G4, MED)

**Files:** Modify `backend/src/modules/customer-vehicle/service.ts` (`activate`). Test: `customer-vehicle` test file.

- [ ] **Step 1 — read** `activate` (`service.ts:18-24`) + the `UQ_customer_vehicle_one_active` index (`Migration20260602090000.ts:22-24`) + how the module runs raw SQL (does it have `knex_`? — mirror `wheel-size` `incrementAndCheckQuota`'s knex use, or use the module's update in a single transaction).
- [ ] **Step 2 — failing test:** two near-simultaneous `activate` calls for the same customer leave EXACTLY ONE active and don't throw. (If the harness can't simulate a true race, assert the query shape sets others inactive + one active in one logical step, and that a unique-violation is caught+retried.)
- [ ] **Step 3 — implement:** replace list-loop-write with a single transaction: deactivate all of the customer's active vehicles except the target, then activate the target — in one transaction (or a conditional `UPDATE ... WHERE customer_id=$c AND id<>$v` then `UPDATE ... WHERE id=$v`). If a unique-violation still surfaces under race, catch it and retry once. No zero/two-active outcome, no 500.
- [ ] **Step 4:** `pnpm test:fitment` + `pnpm test:sync` + `medusa build`. Commit `fix(garage): atomic active-vehicle switch (WB-073 G4)`.

### Task 4: Surface garage write failures — toast + rollback, not `.catch(()=>{})` (G5, MED)

**Files:** Modify `storefront/src/lib/garage/medusa-garage.ts` (`add`/`update`/`remove`/`setActive` catches). Maybe `use-garage.ts` for a toast hook.

- [ ] **Step 1 — read** the 4 `.catch(() => {})` sites + how the optimistic local state is applied (so a rollback can undo the specific change). Find the storefront's toast (`grep -rn "sonner\|toast(" storefront/src/lib storefront/src/modules/common` for the current API).
- [ ] **Step 2 — implement:** replace each empty catch with: log + a user-facing `toast.error("Couldn't save your garage change — please try again.")` + roll back the specific optimistic mutation (re-emit prior state) OR mark it pending for retry. Keep the write idempotent (WB-022). Do NOT reload the whole garage on every failure. `setActive`'s failure (incl. the G4 race 500 before this lands) must now be visible.
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): surface garage write failures (toast + rollback) (WB-073 G5)`.

### Task 5: Honest "couldn't load" vs "empty garage" (G6, MED)

**Files:** Modify `storefront/src/lib/garage/medusa-garage.ts` (`load` + an `isLoaded()`/`loadError` signal), `storefront/src/modules/account/components/garage/index.tsx` (GarageManager empty state).

- [ ] **Step 1 — read** `load()` (`medusa-garage.ts:42-51`) + `GarageManager`'s empty render (`index.tsx:64-68`).
- [ ] **Step 2 — implement:** expose `loadError`/`isLoaded()` on the provider (already tracks `loadOk`). `GarageManager` (and any garage empty-state) renders THREE states: loading, load-failed (an error + a "Retry" that re-calls load), genuinely-empty ("No vehicles saved yet"). Don't show "empty" when the load failed.
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): distinguish failed load from empty garage (WB-073 G6)`.

### Task 6: Merge diff-clear — don't wipe a vehicle added mid-merge (G7, MED)

**Files:** Modify `storefront/src/lib/garage/index.ts` (`syncAuth` merge/clear) + possibly `local-storage-garage.ts` (a `clearOnly(clientIds)` method). Test: `storefront/src/lib/garage/merge.test.ts` (extend).

- [ ] **Step 1 — read** the merge/clear (`index.ts:37-43`) + `LocalStorageGarage.clear` (`local-storage-garage.ts:113-119`).
- [ ] **Step 2 — failing test** (extend `merge.test.ts`): a vehicle added to local AFTER the `toAdd` snapshot but BEFORE the clear must survive the clear (still present in local).
- [ ] **Step 3 — implement:** add `LocalStorageGarage.clearOnly(clientIds: string[])` that removes only those vehicles (by `client_id = vehicle.id`), and change `syncAuth` to `this.local.clearOnly(mergedSnapshot.map(v => v.id))` on merge success instead of a blanket `clear()`. A vehicle added mid-merge isn't in the snapshot → survives → syncs on the next tick. Preserves WB-022 idempotency (still one merge request, stable ids).
- [ ] **Step 4:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): merge clears only merged vehicles, keeps mid-merge adds (WB-073 G7)`.

### Task 7: YMM/garage-pane submit handles non-503 errors (G8, MED)

**Files:** Modify `storefront/src/modules/search/components/search-drawer/find-by-vehicle/ymm-pane.tsx` (`submit`) + `garage-pane.tsx` (`selectVehicle`).

- [ ] **Step 1 — read** both `try { } finally { }` blocks (no catch) + `getFitmentByVehicle`'s 503-only mapping (`fitment.ts:82-99`).
- [ ] **Step 2 — implement:** add a `catch` to both around the fitment fetch: on a non-503 error, `toast.error("Couldn't check fitment right now — please try again.")`, keep the drawer open (don't `onClose`/route), and roll back the optimistic add+activate (or leave the vehicle saved but not fit-routed — pick per the existing UX; the vehicle should NOT be left half-added-and-active-with-no-fitment silently). The 503 "fitment unavailable" path is unchanged (it already degrades gracefully).
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): YMM/garage-pane submit handles non-503 errors (WB-073 G8)`.

### Task 8: Cap merge/create vehicle batches (G9, LOW)

**Files:** Modify `backend/src/api/store/customer/vehicles/validators.ts`. Test: `validators.test.ts`.

- [ ] **Step 1 — failing test:** `VehicleMergeSchema` rejects a `vehicles` array of length 51.
- [ ] **Step 2 — implement:** `vehicles: z.array(VehicleCreateSchema).max(50, "too many vehicles")` on `VehicleMergeSchema` (and the create route if it accepts arrays). 50 is generous for real households, bounded against abuse.
- [ ] **Step 3:** `pnpm test:fitment` + `pnpm test:sync`. Commit `fix(garage): cap merge/create vehicle batch at 50 (WB-073 G9)`.

### Task 9: Strip orphaned `?fit` when the last vehicle is removed (G10, LOW)

**Files:** Modify `storefront/src/modules/discovery/components/fitment-sync/index.tsx`.

- [ ] **Step 1 — read** `FitmentSync` (`index.tsx:16-27`) + how it knows the garage is loaded (`useGarage` — is there an `isLoaded`/`ready` signal? Task 5 adds one).
- [ ] **Step 2 — implement:** when the garage **is loaded** (gate on the isLoaded signal from Task 5, so no boot-flicker) AND there is no active vehicle / no bolt patterns AND a `fit`/`fitb/fitd/fitw/fito` param is present AND it's not the explicit `fit=0` opt-out, strip those params from the URL (router.replace). Preserve the existing "don't auto-strip mid-load" intent — only strip once genuinely loaded-and-empty.
- [ ] **Step 3:** `npx vitest run` + `npx tsc --noEmit`. Commit `fix(garage): strip orphaned ?fit when last vehicle removed (WB-073 G10)`.

### Task 10: Gate sweep
- [ ] Storefront: `cd storefront && npx vitest run && npx tsc --noEmit` (baseline-only).
- [ ] Backend: `cd backend && npx -y pnpm@9.10.0 test:fitment && npx -y pnpm@9.10.0 test:sync && npx -y pnpm@9.10.0 exec medusa build`.
- [ ] `git grep -n "catch(() => {})" storefront/src/lib/garage` → none remain (G5). Commit any fallout.

## Self-Review
Spec coverage: G1/G2→T1, G3→T2, G4→T3, G5→T4, G6→T5, G7→T6, G8→T7, G9→T8, G10→T9; gates→T10. All 10 mapped. Types: `isLoaded()`/`loadError` (T5) consumed by T9; `clearOnly(clientIds)` (T6); the identity/generation lifecycle (T1). No placeholders — read-then-apply steps name file:line + the exact mechanism; the singleton-lifecycle + component edits are confirmed against the spec's current-state table before editing. Ordering: T5 (isLoaded) before T9 (consumes it).
