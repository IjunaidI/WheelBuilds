# Fitment truth (WB-072) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "does this wheel fit your vehicle?" answerable from correct, fresh, quota-honest data, and never over- or under-claim — closing 17 verified findings (8 backend data-integrity + 9 storefront verdict-honesty).

**Architecture:** Backend first (the storefront verdict logic consumes this data): fix the fitment cache key to include the year, store hub-bore at full precision (migration + backfill), make quota exhaustion a 503-not-a-cached-no-match, and make catalog reads quota-counted + expiring + validated + atomic. Then storefront: one per-variant fit predicate drives every "fits" surface (band, chip, list, badge, fit-mode filter, PDP defaults), plus an `unknown` verdict distinct from "doesn't fit", plus honest copy/chip/highlight fixes.

**Tech Stack:** MedusaJS 2.13.6 backend (MikroORM, knex, `test:fitment` jest), Next.js 15 / React 19 storefront (vitest).

**Spec:** [docs/done/specs/2026-07-06-fitment-truth-design.md](../specs/2026-07-06-fitment-truth-design.md)

## Global Constraints

- **Backend commands from `backend/`; storefront from `storefront/`.** No root package.json. If `pnpm` isn't on PATH use `npx -y pnpm@9.10.0 <cmd>`.
- **Backend gates (per task):** `pnpm test:fitment` + `pnpm test:sync` green + `medusa build` exit 0.
- **Storefront gates (per task):** `npx vitest run` green + `npx tsc --noEmit` no NEW errors beyond the ~14 pre-existing baseline (storefront/CLAUDE.md). `build:next` needs a live backend — NOT runnable here; do not run it.
- **Hub-bore convention (mirror the proven `wheel_size_fitment` fix):** store `hub_bore_mm_x100 = Math.round(mm*100)`; read `x100 == null ? null : x100/100`. See `wheel-size/service.ts:89,107` for the reference.
- **`MedusaService` update/create take a single merged object** (`updateX({ id, ...fields })`).
- **Two prod-only scripts** (`backfill-garage-bore.ts`) must be idempotent + refuse without `-- --confirm-host=<DATABASE_URL host>` (mirror `vendor-sync-dev-wipe.ts`). Do NOT run against a live DB.
- **The correct per-variant fit predicate already exists:** `variantFitsVehicle` / `productHasFittingVariant` in `storefront/src/lib/fitment/product-has-fitting-variant.ts` (bolt match AND bore clears AND diameter/width/offset in-window on the SAME variant). Reuse it — do not re-derive a second predicate.
- **Golden-fixture drift guard:** `normalize-finish` + `canonical-bolt-pattern` have backend↔storefront golden twins; keep any shared logic in lockstep.
- **Commit style:** `fix(fitment): <what> (WB-072 <id>)` ending with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `backend/src/modules/wheel-size/cache-key.ts` *(new)* | Pure `buildFitmentCacheKey` incl. year | T1 |
| `backend/src/modules/wheel-size/service.ts` | Use the key; quota-out throws; catalog quota+TTL; atomic upsert | T1,T3,T4,T5,T7 |
| `backend/src/jobs/wheel-size-warm.ts` | `parseCacheKey` for the new key shape | T1 |
| `backend/src/modules/customer-vehicle/` (migration, model, service) + `api/store/customer/vehicles/[id]/route.ts` + `backend/src/scripts/backfill-garage-bore.ts` *(new)* | Hub-bore x100 + validation + backfill | T2,T6 |
| `backend/src/api/store/vehicle-catalog/*/route.ts` | Validate + 503 on quota-out | T4 |
| `backend/src/modules/wheel-size/reverse-fitment.ts` + `api/store/fitment/by-product/route.ts` | Size-window gate | T10 |
| `storefront/src/lib/fitment/fits-vehicle.ts` | Per-size conjunction + `unknown` verdict | T8 |
| `storefront/src/modules/product-detail/data/fit-view.ts` + `.../hero/index.tsx` | Per-variant bore+offset pairing + offset trim/default | T9 |
| `storefront/.../get-product.ts` (loader) | Pass windows to reverse-fitment | T10 |
| `storefront/.../discovery/components/grid/fit-badge.tsx` (+ card) | Per-variant badge gate | T11 |
| `storefront/.../product-detail/components/fitment/index.tsx` | Honest copy, live CTA, year/trim highlight | T12,T14 |
| `storefront/.../hero/advanced-fitment-panel.tsx` | Compound offset-chip key | T13 |

---

### Task 1: Fitment cache key includes the year (B1 + B3)

**Files:**
- Create: `backend/src/modules/wheel-size/cache-key.ts`
- Modify: `backend/src/modules/wheel-size/service.ts:67,101`; `backend/src/jobs/wheel-size-warm.ts` (`parseCacheKey`)
- Test: `backend/src/modules/wheel-size/__tests__/cache-key.test.ts` (new)

**Interfaces:**
- Produces: `buildFitmentCacheKey(p: { make: string; model: string; year?: string; modificationSlug?: string; region: string }): string` → `[make, model, year ?? "", modificationSlug ?? "", region].join("|")`. Year is ALWAYS a slot; trim is a separate slot.

- [ ] **Step 1: Write the failing test** — `cache-key.test.ts`:

```ts
import { buildFitmentCacheKey } from "../cache-key"

describe("buildFitmentCacheKey", () => {
  it("keeps the year even when a trim slug is present (F-B1)", () => {
    const a = buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2018", modificationSlug: "330i", region: "usdm" })
    const b = buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" })
    expect(a).not.toBe(b) // same trim, different year -> distinct rows
  })
  it("is stable and includes all parts", () => {
    expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", modificationSlug: "330i", region: "usdm" }))
      .toBe("bmw|3-series|2020|330i|usdm")
  })
  it("tolerates a missing trim", () => {
    expect(buildFitmentCacheKey({ make: "bmw", model: "3-series", year: "2020", region: "usdm" }))
      .toBe("bmw|3-series|2020||usdm")
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx jest src/modules/wheel-size/__tests__/cache-key.test.ts` (module not found).

- [ ] **Step 3: Implement** — `cache-key.ts`:

```ts
/**
 * Deterministic fitment cache key (WB-072 B1). The YEAR is always a key slot —
 * previously the key was `modificationSlug ?? year`, which dropped the year
 * whenever a trim slug was present, so trim slugs that repeat across generations
 * collided and served wrong-year fitment.
 */
export function buildFitmentCacheKey(p: {
  make: string
  model: string
  year?: string
  modificationSlug?: string
  region: string
}): string {
  return [p.make, p.model, p.year ?? "", p.modificationSlug ?? "", p.region].join("|")
}
```

- [ ] **Step 4: Use it in service.ts** — replace BOTH `const cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), region].join("|")` (line ~67, `getFitment`) and the same at line ~101 (`refreshFitment`, uses `p.region`) with `const cache_key = buildFitmentCacheKey({ ...p, region })` (getFitment) / `buildFitmentCacheKey(p)` (refreshFitment — `p` already has `region`). Add `import { buildFitmentCacheKey } from "./cache-key"`.

- [ ] **Step 5: Update the warm cron `parseCacheKey`** — in `wheel-size-warm.ts`, the key now has 5 pipe-separated parts `[make, model, year, modificationSlug, region]`. Update `parseCacheKey` to split into exactly those 5 slots and return `{ make, model, year: parts[2] || undefined, modificationSlug: parts[3] || undefined, region: parts[4] }` — so trim-keyed rows now carry the year and `client.byModel` no longer 400s (fixes B3). Read the current function and adapt to the 5-slot shape.

- [ ] **Step 6: Verify** — `npx jest src/modules/wheel-size/__tests__/cache-key.test.ts` PASS; `pnpm test:fitment` + `pnpm test:sync` green; `npx tsc --noEmit` no new.

- [ ] **Step 7: Commit** — `git add ...` → `fix(fitment): cache key always includes the year (WB-072 B1/B3)`.

---

### Task 2: Hub-bore stored at full precision + backfill (B2, safety)

**Files:**
- Create: `backend/src/modules/customer-vehicle/migrations/Migration<ts>.ts`
- Modify: `backend/src/modules/customer-vehicle/models/customer-vehicle.ts`; `.../service.ts` (`createForCustomer`, `activate`/any writer); `backend/src/api/store/customer/vehicles/[id]/route.ts`; the vehicle DTO/serialization that returns `hubBoreMm`
- Create: `backend/src/scripts/backfill-garage-bore.ts`

**Interfaces:** column `hub_bore_mm` → `hub_bore_mm_x100`; writers store `Math.round(hubBoreMm*100)`; readers return `x100 == null ? null : x100/100`.

- [ ] **Step 1: Write the migration** — mirror `wheel-size/migrations/Migration20260623120000.ts` exactly. Create `Migration<ts>.ts` (use a timestamp after the latest customer-vehicle migration):

```ts
import { Migration } from "@mikro-orm/migrations"

export class Migration<ts> extends Migration {
  async up(): Promise<void> {
    // WB-072 B2: hub_bore_mm was INTEGER (truncated 106.1 -> 106). Rename to
    // hub_bore_mm_x100 and carry forward the (already-truncated) mm as x100.
    this.addSql('alter table if exists "customer_vehicle" rename column "hub_bore_mm" to "hub_bore_mm_x100";')
    this.addSql('update "customer_vehicle" set "hub_bore_mm_x100" = "hub_bore_mm_x100" * 100 where "hub_bore_mm_x100" is not null;')
  }
  async down(): Promise<void> {
    this.addSql('update "customer_vehicle" set "hub_bore_mm_x100" = round("hub_bore_mm_x100" / 100) where "hub_bore_mm_x100" is not null;')
    this.addSql('alter table if exists "customer_vehicle" rename column "hub_bore_mm_x100" to "hub_bore_mm";')
  }
}
```

- [ ] **Step 2: Update the model** — in `models/customer-vehicle.ts` rename the field `hub_bore_mm: model.number().nullable()` → `hub_bore_mm_x100: model.number().nullable()`.

- [ ] **Step 3: Writers store x100** — in `customer-vehicle/service.ts` `createForCustomer` (~line 44) change `hub_bore_mm: input.hubBoreMm ?? null` → `hub_bore_mm_x100: input.hubBoreMm == null ? null : Math.round(input.hubBoreMm * 100)`. In `api/store/customer/vehicles/[id]/route.ts` (~line 15) change `hub_bore_mm: b.hubBoreMm` → `hub_bore_mm_x100: b.hubBoreMm == null ? null : Math.round(b.hubBoreMm * 100)`. Grep the module for any other `hub_bore_mm` writer/reader and update (including `mergeForCustomer`).

- [ ] **Step 4: Readers divide by 100** — find where a `customer_vehicle` row is mapped to the wire DTO (`hubBoreMm`) — likely in the vehicles GET route / a `toWire`/serializer, and in `storefront/src/lib/garage/medusa-garage.ts` `fromWire` if it reads the raw column name. Return `row.hub_bore_mm_x100 == null ? null : row.hub_bore_mm_x100 / 100`. (If the backend DTO already does the /100 mapping, the storefront needs no change; confirm by reading both.)

- [ ] **Step 5: Backfill script** — create `backfill-garage-bore.ts` (guarded `medusa exec`, `--confirm-host` like `vendor-sync-dev-wipe.ts`): for each `customer_vehicle` with make/model/year, call the wheel-size service `getFitment({make, model, year, modificationSlug, region})` and write `hub_bore_mm_x100 = Math.round(fitment.hubBoreMm*100)` (recovers true precision). Idempotent; logs per-vehicle; skips rows already at full precision if detectable. Do NOT run it.

- [ ] **Step 6: Verify** — `pnpm test:fitment` + `pnpm test:sync` green; `medusa build` exit 0 (migration + script compile). `npx tsc --noEmit` no new. Confirm no stray `hub_bore_mm` (non-x100) reference remains: `git grep -n "hub_bore_mm\b" backend/src/modules/customer-vehicle backend/src/api/store/customer` → only `_x100`.

- [ ] **Step 7: Commit** — `fix(fitment): store garage hub-bore at full precision + backfill (WB-072 B2)`.

---

### Task 3: Quota exhaustion never caches a false not_found (B4)

**Files:** Modify `backend/src/modules/wheel-size/service.ts` (`resolveByModel`, ~lines 173, 181)

- [ ] **Step 1:** In `resolveByModel`, replace the trim-retry quota guard `if (!(await this.incrementAndCheckQuota())) return { body: emptyBody, regionUsed: p.region }` (~line 173) with `if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()`.
- [ ] **Step 2:** Replace the region-probe quota guard `if (!(await this.incrementAndCheckQuota())) break` (~line 181) with `if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()`. Rationale: quota-out is an outage (503, uncached), NOT a no-match — returning an empty body lets `refreshFitment` persist a durable `not_found`. `QuotaOutageError` is already thrown at line 160/162 and caught by `by-vehicle/route.ts` as a 503.
- [ ] **Step 3: Verify** — `pnpm test:fitment` (add/adjust a case if the suite covers resolveByModel quota paths; if a test asserted the old empty-body-return, update it to expect the throw). `pnpm test:sync` green.
- [ ] **Step 4: Commit** — `fix(fitment): quota exhaustion is a 503, not a cached not_found (WB-072 B4)`.

---

### Task 4: Catalog reads count quota + validate + degrade to 503 (B5)

**Files:** Modify `backend/src/modules/wheel-size/service.ts` (`catalog`, ~215); `backend/src/api/store/vehicle-catalog/{makes,models,years,modifications}/route.ts`

- [ ] **Step 1: Quota-count the catalog fetch** — in `catalog()` (~line 215), before `const res = await fetcher()` add `if (!(await this.incrementAndCheckQuota())) throw new QuotaOutageError()` (so cataloging misses count against the same authoritative counter as by_model).
- [ ] **Step 2: Routes validate + catch** — in each of the four `vehicle-catalog` routes, read the current handler; add basic validation (each of `make`/`model`/`year` present, string, length-bounded e.g. ≤ 64 chars, else 400) and wrap the service call in `try { ... } catch (e) { if (e instanceof QuotaOutageError) { res.status(503).json({ type: "service_unavailable", message: "Vehicle catalog temporarily unavailable" }); return } throw e }` — mirror `store/fitment/by-vehicle/route.ts`'s existing QuotaOutageError handling.
- [ ] **Step 3: Verify** — `pnpm test:fitment` + `pnpm test:sync` green; `medusa build` exit 0.
- [ ] **Step 4: Commit** — `fix(fitment): catalog reads count quota + validate + 503 on outage (WB-072 B5)`.

---

### Task 5: Catalog cache expires (B6)

**Files:** Modify `backend/src/modules/wheel-size/service.ts` (`catalog`, ~215)

- [ ] **Step 1:** Give `catalog()` the same staleness/SWR pattern `getFitment` uses. On a hit, check `isStale(hit[0].fetched_at, this.ttlDays_, new Date())`; if stale, refresh in the background (`void (async () => { ...fetch + updateWheelSizeCatalogs... })().catch(...)`) and return the current payload; if fresh, return it. `isStale` is already imported. Persist `fetched_at` on write (already done at line 220). Read the current `catalog()` + `getFitment`'s stale block (lines 70-78) and mirror it.
- [ ] **Step 2: Verify** — `pnpm test:fitment` + `pnpm test:sync` green.
- [ ] **Step 3: Commit** — `fix(fitment): catalog cache expires via TTL/SWR (WB-072 B6)`.

---

### Task 6: Vehicle update route is validated (B7)

**Files:** Modify `backend/src/api/store/customer/vehicles/[id]/route.ts`; `backend/src/api/store/customer/vehicles/validators.ts`

- [ ] **Step 1:** In `validators.ts`, export `VehicleUpdateSchema = VehicleCreateSchema.partial()` (all fields optional for a partial update) + `parseVehicleUpdate(body)`. Read the current `VehicleCreateSchema` + `parseVehicleCreate` to match the pattern.
- [ ] **Step 2:** In `[id]/route.ts`, replace `const b = req.body as any` with `const b = parseVehicleUpdate(req.body)` (which validates + narrows), then map the validated fields into `updateCustomerVehicles`. Keep the `hub_bore_mm_x100: Math.round(b.hubBoreMm*100)` mapping from Task 2.
- [ ] **Step 3: Verify** — `pnpm test:fitment` + `pnpm test:sync` green; `medusa build` exit 0.
- [ ] **Step 4: Commit** — `fix(fitment): validate the vehicle update route body (WB-072 B7)`.

---

### Task 7: Atomic fitment upsert (B8)

**Files:** Modify `backend/src/modules/wheel-size/service.ts` (`refreshFitment`, ~111-113)

- [ ] **Step 1:** Replace the non-atomic list-then-create (`const existing = await this.listWheelSizeFitments({ cache_key }); if (existing[0]) update else create`) with an atomic upsert via `this.knex_.raw(...)` `INSERT ... ON CONFLICT (cache_key) WHERE deleted_at IS NULL DO UPDATE SET ...` — mirror the exact pattern in `incrementAndCheckQuota` (lines 52-59). Map the `row` object's columns into the insert. This removes the race (two concurrent misses both inserting → unique violation → 500). Confirm the partial unique index name/columns from `Migration20260601111311.ts`.
- [ ] **Step 2: Verify** — `pnpm test:fitment` + `pnpm test:sync` green; `medusa build` exit 0.
- [ ] **Step 3: Commit** — `fix(fitment): atomic fitment cache upsert (WB-072 B8)`.

---

### Task 8: `fitsVehicle` per-size conjunction + `unknown` verdict (S1 + S5, safety)

**Files:** Modify `storefront/src/lib/fitment/fits-vehicle.ts`; consumers (`fitment/index.tsx`, and the chip if it reads `FitVerdict`)
**Test:** `storefront/src/lib/fitment/__tests__/fits-vehicle.test.ts` (extend)

**Interfaces:** `fitsVehicle(product, vehicle): FitVerdict` where `FitVerdict = { status: "fits" | "no-fit" | "unknown"; fits: boolean; reasons: string[] }` (keep `fits` for back-compat; `status` is the new source of truth). `unknown` when the vehicle has no bolt-pattern data.

- [ ] **Step 1: Write failing tests** — add to `fits-vehicle.test.ts`: (a) a product with sizes `20x9 ET-12` and `22x12 ET+30` vs window d20-22/w8.5-9.5/ET20-40 → **no-fit** (no single size satisfies diameter+width+offset together), where the OLD per-dimension code returned fits; (b) a vehicle with `canonicalBoltPatterns: []` → **unknown** (not "no-fit", no "bolt pattern does not match" reason). Use the existing test's fixture shape.

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/fitment/__tests__/fits-vehicle.test.ts`.

- [ ] **Step 3: Implement** — rewrite `fitsVehicle`:
  - If `vPats.length === 0` → return `{ status: "unknown", fits: false, reasons: ["We don't have fitment data for your vehicle yet."] }` (S5 — unknown, not mismatch).
  - Keep the bolt + bore hard gates. Replace the three independent per-dimension `inWin` checks with a **per-size conjunction**: `withinWindow = hardGatesPass && sizes.some((s) => inWin([s.diameter], diameterWindow) && inWin([s.width], widthWindow) && inWinOffsets(s, offsetWindow))` where `inWinOffsets(s, w)` checks `(s.offsetVariants?.length ? s.offsetVariants.some(o => scalarInWin(o.value, w)) : scalarInWin(s.offsetMm, w))`. This requires ONE size to satisfy diameter AND width AND an in-window offset together (S1). Remove the stale "so they can never disagree" comment.
  - `status = !hardGatesPass ? "no-fit" : withinWindow ? "fits" : "no-fit"`; `fits = status === "fits"`.
- [ ] **Step 4: Thread `unknown` into the consumer** — in `fitment/index.tsx` (the active-vehicle band, the sole `fitsVehicle` consumer), render the `unknown` status as an informational "We don't have fitment data for your {vehicle} yet" state rather than a red "doesn't fit". Read the current band rendering and add the `unknown` branch. If the PDP chip reads the same `FitVerdict`, give it a neutral "fit unknown" state too.
- [ ] **Step 5: Run → PASS** — `npx vitest run src/lib/fitment/__tests__/fits-vehicle.test.ts` + full `npx vitest run` + `npx tsc --noEmit` no new.
- [ ] **Step 6: Commit** — `fix(fitment): fitsVehicle requires one fitting variant + unknown state (WB-072 S1/S5)`.

---

### Task 9: `buildFitView` pairs bore+offset per variant + trims/defaults the offset (S4 + S3)

**Files:** Modify `storefront/src/modules/product-detail/data/fit-view.ts`; `.../hero/index.tsx` (`defaultOffsetMm`)
**Test:** `storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts` (extend if present, else create)

- [ ] **Step 1: Write failing test** — a size with variants `{ET40, bore66}` and `{ET-10, bore106}` vs hub 73 / offsetWindow 35-50 → the size must NOT survive (no single variant both clears the hub AND is in-window). The OLD two-`.some()` code keeps it.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement (S4)** — collapse `boltCompatible` + `withinWindows` so the bore-clear and offset-window checks are paired **per variant**. Replace the two independent `offsets.some(...)` with a single predicate: bolt match (size-level) AND `size.offsetVariants.some(o => boreClears(o.centerBoreMm) && inWin(o.value, offsetWindow))` (plus the size-level diameter/width window). Keep the empty-offsetVariants fallback (`boreClears(null) && inWin(size.offsetMm, offsetWindow)`).

- [ ] **Step 4: Implement (S3) — trim + default the offset** — in `trim()`, for each surviving size also filter its `offsetVariants` to the in-window+bore-clearing ones (so the fit-filtered PDP never surfaces an out-of-window ET). In `hero/index.tsx` (~line 115), when fit-mode is active, `defaultOffsetMm` picks a fitting offset from the trimmed `offsetVariants` (the first in-window one) rather than `selectedSize.defaultOffsetMm ?? selectedSize.offsetMm`. Read the hero's fit-mode flag + selectedSize wiring and thread it.

- [ ] **Step 5: Run → PASS** + full `npx vitest run` + `npx tsc --noEmit` no new.
- [ ] **Step 6: Commit** — `fix(fitment): fit-view pairs bore+offset per variant + trims/defaults offset (WB-072 S3/S4)`.

---

### Task 10: "Confirmed models" list uses the size-window gate (S2)

**Files:** Modify `backend/src/modules/wheel-size/reverse-fitment.ts`; `backend/src/api/store/fitment/by-product/route.ts`; `backend/src/modules/wheel-size/service.ts` (`reverseFitment` signature); `storefront/src/modules/product-detail/data/get-product.ts` (`getFitmentByProduct` call)
**Test:** `backend/src/modules/wheel-size/__tests__/reverse-fitment.test.ts` (extend)

- [ ] **Step 1: Write failing test** — a cached vehicle whose bolt+bore match a product but whose diameter/width/offset windows EXCLUDE the product's only sizes must NOT appear in the reverse list once windows are passed.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — extend `buildReverseFitment` (and `reverseFitment`/the `by-product` route + the storefront loader) to accept the product's representative diameter/width/offset (or the set of its `(diameter,width,offset)` variants) and require, per cached vehicle, that at least one product variant is in that vehicle's windows (reuse the same `inWin` logic as `fitsVehicle`/`variantFitsVehicle`). The storefront loader `getFitmentByProduct` (get-product.ts ~118) passes `detail.sizeOptions` (diameter/width/offset) alongside the bolt patterns + bore. Read the current reverse-fitment match + route body + loader and thread the windows through.
- [ ] **Step 4: Run → PASS** + `pnpm test:fitment` + `pnpm test:sync` + `medusa build` exit 0; storefront `npx tsc --noEmit` no new.
- [ ] **Step 5: Commit** — `fix(fitment): confirmed-models list requires an in-window size (WB-072 S2)`.

---

### Task 11: Discovery "FITS" badge uses the per-variant gate (S6)

**Files:** Modify `storefront/src/modules/discovery/components/grid/fit-badge.tsx` (+ `product-card.tsx` to thread variant data if needed)

- [ ] **Step 1:** `FitBadge` must render "FITS" only when the product has a genuinely-fitting variant, not on a bolt-pattern-only intersection. Read `fit-badge.tsx` + `product-card.tsx`. Either (a) thread the product's variant metadata onto the card and gate the badge on `productHasFittingVariant(variants, vehicle)` (the same predicate the fit-mode listing filter uses), or (b) if variant metadata isn't available on the discovery card, render the badge ONLY in fit-mode (where the list is already post-filtered to fitting products) and drop it in plain browse. Pick per what data the card actually has; state the choice in the report.
- [ ] **Step 2: Verify** — `npx vitest run` + `npx tsc --noEmit` no new.
- [ ] **Step 3: Commit** — `fix(fitment): discovery FITS badge no longer over-claims (WB-072 S6)`.

---

### Task 12: Honest fitment copy + live CTA (S7)

**Files:** Modify `storefront/src/modules/product-detail/components/fitment/index.tsx` (~39 copy, ~142 CTA)

- [ ] **Step 1:** Replace the SectionHeader description "Every fitment below has been bench-verified for offset, hub bore, and brake clearance." with honest copy describing what's actually checked, e.g. "Each vehicle below matches this wheel's bolt pattern and hub bore, per wheel-size.com data." Change the "Submit your build for fitment" CTA at ~line 142 from `href="#"` to either a real destination (e.g. a `mailto:` / contact route if one exists) or remove the CTA + its "confirm within 24 hours" promise. Read the current markup; keep the design/`.frame` styling.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` no new + `npx vitest run` no regressions.
- [ ] **Step 3: Commit** — `fix(fitment): honest fitment copy + no dead CTA (WB-072 S7)`.

---

### Task 13: No duplicate offset chips/keys (S8)

**Files:** Modify `storefront/src/modules/product-detail/components/hero/advanced-fitment-panel.tsx` (~95)

- [ ] **Step 1:** Change `offsetVariants.map((o) => ... key={o.value})` to a compound key `key={\`${o.value}|${o.centerBoreMm ?? "x"}\`}` so bore-branching sizes (two variants at the same ET, different bore) don't share a React key. Fix the `sel = o.value === selectedOffsetMm` so it doesn't mark BOTH same-ET chips selected — incorporate the selected bore (coordinate with the existing bore `SpecSelector`), e.g. compare both offset and the active bore. Read the panel + the hero's bore-selection state and thread it.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` no new + `npx vitest run`.
- [ ] **Step 3: Commit** — `fix(fitment): unique offset-chip keys, no double-selected chip (WB-072 S8)`.

---

### Task 14: "YOUR VEHICLE" highlight matches year/trim (S9)

**Files:** Modify `storefront/src/modules/product-detail/components/fitment/index.tsx` (~124)

- [ ] **Step 1:** `isActive` currently compares only lowercased make/model. Add year (and trim where the entry carries it) to the comparison so only the shopper's actual generation is tagged "YOUR VEHICLE". Read the `FitmentEntry` shape (make/model/year/trim) + the active vehicle fields and compare all available identity fields.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` no new + `npx vitest run`.
- [ ] **Step 3: Commit** — `fix(fitment): YOUR VEHICLE highlight matches year/trim (WB-072 S9)`.

---

### Task 15: Full gate sweep

**Files:** none (verification only).

- [ ] **Step 1: Backend** — `cd backend && npx -y pnpm@9.10.0 test:fitment && npx -y pnpm@9.10.0 test:sync && npx -y pnpm@9.10.0 exec medusa build` → all green, build exit 0.
- [ ] **Step 2: Storefront** — `cd storefront && npx vitest run && npx tsc --noEmit` → vitest green, tsc only the ~14 baseline.
- [ ] **Step 3: Stray-ref checks** — `git grep -n "modificationSlug ?? p.year" backend/src` → none; `git grep -n "hub_bore_mm\b" backend/src/modules/customer-vehicle backend/src/api/store/customer` → only `_x100`.
- [ ] **Step 4: Commit if anything changed** — `chore(fitment): WB-072 gate sweep`.

---

## Self-Review

**Spec coverage:** B1→T1, B2→T2, B3→T1, B4→T3, B5→T4, B6→T5, B7→T6, B8→T7; S1→T8, S2→T10, S3→T9, S4→T9, S5→T8, S6→T11, S7→T12, S8→T13, S9→T14. All 17 mapped. Testing (§5) → T1/T2/T8/T9/T10 unit + T15 gates. Deploy notes (§6): A1 re-key + A2 backfill flagged in the spec; the two scripts are guarded.

**Type consistency:** `buildFitmentCacheKey` (T1) 5-slot key consumed by service + warm cron. `hub_bore_mm_x100` (T2) column + Math.round(×100)/÷100 convention used by writers/readers/backfill. `FitVerdict.status` (T8) `"fits"|"no-fit"|"unknown"` consumed by `fitment/index.tsx`. `variantFitsVehicle`/`productHasFittingVariant` reused (not re-derived) in T8/T9/T10/T11 per the global constraint. `QuotaOutageError` (existing) reused in T3/T4.

**Placeholder scan:** the migration `Migration<ts>` is a naming instruction (real timestamp chosen at implementation, after the latest customer-vehicle migration). The read-then-apply steps (T5 SWR, T8 consumer branch, T9 hero default, T10 reverse threading, T11–T14 components) name the exact file+line+mechanism+reuse-target; the surrounding code is confirmed by the implementer before editing (these are edits to existing files, not new logic invented blind).
