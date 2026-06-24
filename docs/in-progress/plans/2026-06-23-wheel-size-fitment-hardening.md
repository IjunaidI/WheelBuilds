# Wheel-size Fitment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wheel-size fitment cache time-aware (TTL + warm cron), non-hanging (client timeout), non-blocking on refresh (stale-while-revalidate), atomic on the quota counter, and correct on fractional hub bore — WB-007/008/019/020/043.

**Architecture:** All changes live in `backend/src/modules/wheel-size/` plus one cron and config. A new pure `staleness.ts` isolates TTL logic. Hub bore is stored as a scaled integer (`hub_bore_mm_x100`) to avoid ORM-snapshot drift. The read path serves fresh from cache, serves stale instantly + refreshes in the background, and bounds true-miss fetches with an `AbortController` timeout. A nightly warm cron refreshes stale entries. The quota counter becomes a single atomic upsert-increment.

**Tech Stack:** TypeScript, MedusaJS 2.13.6 module service (`MedusaService` + DML `model`), MikroORM migrations + module snapshot, knex (`__pg_connection__`) for raw SQL, Jest (`pnpm test:fitment`).

## Global Constraints

- **Bore storage = scaled integer ×100.** `model.number()` generates `integer` (snapshot-confirmed); keep it that way (no `numeric`/`float`) so there is zero `db:generate` snapshot drift. Store `Math.round(mm*100)`, read `/100`. (spec decision 2)
- **`VehicleFitment` contract unchanged:** `hubBoreMm` stays a fractional number in **mm**; the route envelope stays `{ fitment }`. Storefront is untouched.
- **No `@/` import prefix in backend** — imports resolve via `paths: {"*": ["./src/*"]}`.
- **Read path = bounded-block + stale-while-revalidate** (spec decision 1): true miss blocks (timeout-bounded); stale serves instantly + background refresh; no queue/worker.
- **Defaults:** `ttlDays=90` (`WHEEL_SIZE_TTL_DAYS`), `requestTimeoutMs=5000` (`WHEEL_SIZE_TIMEOUT_MS`), `warmBatchSize=200` (`WHEEL_SIZE_WARM_BATCH`). All env-configurable; all have safe defaults so deploy needs no env change.
- **Hand-author wheel-size migrations** (the repo does — `db:generate` emits a drop-everything diff for this module) and keep the module snapshot in lockstep.
- **Test gate:** `cd backend && pnpm test:fitment` (offline, green) + `npx tsc --noEmit` (0 errors). If `pnpm` isn't on PATH use `npx -y pnpm@9.10.0 test:fitment`.

---

## Task 1: `staleness.ts` pure TTL helper

**Files:**
- Create: `backend/src/modules/wheel-size/staleness.ts`
- Create: `backend/src/modules/wheel-size/__tests__/staleness.test.ts`

**Interfaces:**
- Produces: `isStale(fetchedAt: Date | string | null | undefined, ttlDays: number, now: Date): boolean` — true when the entry is older than `ttlDays` (or `fetchedAt` is missing/invalid). `selectStaleForWarm<T extends { fetched_at?: Date | string | null }>(rows: T[], ttlDays: number, now: Date, batch: number): T[]` — the stale rows, oldest-first, capped at `batch`.

- [ ] **Step 1: Write the failing tests.** Create `staleness.test.ts`:

```ts
import { isStale, selectStaleForWarm } from "../staleness"

const now = new Date("2026-06-23T00:00:00Z")
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

describe("isStale", () => {
  it("is fresh within the TTL", () => {
    expect(isStale(daysAgo(10), 90, now)).toBe(false)
  })
  it("is stale past the TTL", () => {
    expect(isStale(daysAgo(91), 90, now)).toBe(true)
  })
  it("treats exactly-at-TTL as fresh (strict older-than)", () => {
    expect(isStale(daysAgo(90), 90, now)).toBe(false)
  })
  it("accepts an ISO string", () => {
    expect(isStale(daysAgo(100).toISOString(), 90, now)).toBe(true)
  })
  it("treats missing/invalid fetched_at as stale", () => {
    expect(isStale(null, 90, now)).toBe(true)
    expect(isStale(undefined, 90, now)).toBe(true)
    expect(isStale("not-a-date", 90, now)).toBe(true)
  })
})

describe("selectStaleForWarm", () => {
  it("returns only stale rows, oldest-first, capped at batch", () => {
    const rows = [
      { id: "fresh", fetched_at: daysAgo(1) },
      { id: "old", fetched_at: daysAgo(120) },
      { id: "older", fetched_at: daysAgo(200) },
      { id: "stale", fetched_at: daysAgo(91) },
    ]
    const out = selectStaleForWarm(rows, 90, now, 2)
    expect(out.map((r) => r.id)).toEqual(["older", "old"])
  })
})
```

- [ ] **Step 2: Run, verify fail.** `cd backend && pnpm test:fitment -- staleness` → FAIL (module not found).

- [ ] **Step 3: Implement.** Create `staleness.ts`:

```ts
const DAY_MS = 86_400_000

const toMs = (v: Date | string | null | undefined): number | null => {
  if (v == null) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** True when the entry is older than ttlDays, or its fetched_at is missing/invalid. */
export function isStale(
  fetchedAt: Date | string | null | undefined,
  ttlDays: number,
  now: Date
): boolean {
  const ms = toMs(fetchedAt)
  if (ms == null) return true
  return now.getTime() - ms > ttlDays * DAY_MS
}

/** Stale rows, oldest-first, capped at batch — the warm cron's work list. */
export function selectStaleForWarm<T extends { fetched_at?: Date | string | null }>(
  rows: T[],
  ttlDays: number,
  now: Date,
  batch: number
): T[] {
  return rows
    .filter((r) => isStale(r.fetched_at, ttlDays, now))
    .sort((a, b) => (toMs(a.fetched_at) ?? 0) - (toMs(b.fetched_at) ?? 0))
    .slice(0, Math.max(batch, 0))
}
```

- [ ] **Step 4: Run, verify pass.** `cd backend && pnpm test:fitment -- staleness` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/wheel-size/staleness.ts backend/src/modules/wheel-size/__tests__/staleness.test.ts
git commit -m "feat(wheel-size): pure TTL staleness helper (WB-008)"
```

---

## Task 2: Fractional hub bore via scaled integer (`hub_bore_mm_x100`)

**Files:**
- Modify: `backend/src/modules/wheel-size/models/wheel-size-fitment.ts`
- Create: `backend/src/modules/wheel-size/migrations/Migration20260623120000.ts`
- Modify: `backend/src/modules/wheel-size/migrations/.snapshot-wheel-size-module.json` (rename field)
- Modify: `backend/src/modules/wheel-size/service.ts` (read/write scaling in `getFitment`)
- Modify: `backend/src/modules/wheel-size/reverse-fitment.ts` (read scaling)
- Test: `backend/src/modules/wheel-size/__tests__/service.test.ts`

**Interfaces:**
- Produces: cache column `hub_bore_mm_x100` (integer hundredths of a mm); `VehicleFitment.hubBoreMm` stays fractional mm.
- Consumes: nothing new.

- [ ] **Step 1: Write/adjust the failing tests.** In `service.test.ts`, (a) the existing `reverseFitment` test rows use `hub_bore_mm` — change to `hub_bore_mm_x100` with ×100 values; (b) add a bore round-trip test. Replace the `makeReverseService` rows and add the round-trip test:

```ts
// in the reverseFitment describe — rows now use hub_bore_mm_x100 (×100):
const svc = makeReverseService([
  { status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6400, raw: raw("Honda", "Civic") },
  { status: "ok", canonical_bolt_patterns: ["6x139.7"], hub_bore_mm_x100: 10000, raw: raw("Ford", "F150") },
])
// (assertions unchanged: Honda Civic 5x114.3, wheelBoreMm 70 clears 64)
```

```ts
// new describe in service.test.ts — fractional bore round-trips through the cache:
describe("WheelSizeService.getFitment hub bore scaling (WB-007)", () => {
  it("stores fractional bore ×100 and reads it back as the exact decimal", async () => {
    const { svc, store } = makeService([
      { status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 114.3, centre_bore: 67.1 }, wheels: [] } ] } },
    ])
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.hubBoreMm).toBe(67.1)
    expect(store.fitment.get("honda|accord|m|usdm").hub_bore_mm_x100).toBe(6710)
    const again = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(again.hubBoreMm).toBe(67.1) // served from cache, exact
  })
})
```

(`centre_bore: 67.1` → `normalizeByModel` sets `hubBoreMm: 67.1`; confirm against `normalize.ts` — it reads `technical.centre_bore`.)

- [ ] **Step 2: Run, verify fail.** `cd backend && pnpm test:fitment -- service` → FAIL (writes `hub_bore_mm`, reads truncate).

- [ ] **Step 3: Rename the model field.** In `wheel-size-fitment.ts` change `hub_bore_mm: model.number().nullable(),` → `hub_bore_mm_x100: model.number().nullable(),`.

- [ ] **Step 4: Update the module snapshot.** In `.snapshot-wheel-size-module.json`, change the two `hub_bore_mm` references (the property key `"hub_bore_mm": {` and its `"name": "hub_bore_mm",`) to `hub_bore_mm_x100`. (Leave `"type": "integer"`.)

- [ ] **Step 5: Hand-author the migration.** Create `Migration20260623120000.ts`:

```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260623120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wheel_size_fitment" rename column "hub_bore_mm" to "hub_bore_mm_x100";`);
    // Old values were truncated integer mm; carry forward as ×100 (67 -> 6700 = 67.00mm).
    // The warm cron later refreshes them to the exact ×100 value.
    this.addSql(`update "wheel_size_fitment" set "hub_bore_mm_x100" = "hub_bore_mm_x100" * 100 where "hub_bore_mm_x100" is not null;`);
  }
  override async down(): Promise<void> {
    this.addSql(`update "wheel_size_fitment" set "hub_bore_mm_x100" = round("hub_bore_mm_x100" / 100.0) where "hub_bore_mm_x100" is not null;`);
    this.addSql(`alter table if exists "wheel_size_fitment" rename column "hub_bore_mm_x100" to "hub_bore_mm";`);
  }
}
```

- [ ] **Step 6: Scale in `service.ts` `getFitment`.** Cache-hit read (was `hubBoreMm: c.hub_bore_mm ?? null`):

```ts
        hubBoreMm: c.hub_bore_mm_x100 == null ? null : (c.hub_bore_mm_x100 as number) / 100,
```

Write (was `hub_bore_mm: fitment.hubBoreMm`):

```ts
      hub_bore_mm_x100: fitment.hubBoreMm == null ? null : Math.round(fitment.hubBoreMm * 100),
```

- [ ] **Step 7: Scale in `reverse-fitment.ts`.** Change `FitmentRow.hub_bore_mm?: number | null` → `hub_bore_mm_x100?: number | null`, and in `matchedPattern` read it scaled:

```ts
  const hub = typeof row.hub_bore_mm_x100 === "number" ? row.hub_bore_mm_x100 / 100 : null
```

- [ ] **Step 8: Run, verify pass + tsc.** `cd backend && pnpm test:fitment && npx tsc --noEmit` → PASS, 0 errors.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/modules/wheel-size/models/wheel-size-fitment.ts backend/src/modules/wheel-size/migrations/ backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/reverse-fitment.ts backend/src/modules/wheel-size/__tests__/service.test.ts
git commit -m "fix(wheel-size): store hub bore as scaled integer ×100 (WB-007)"
```

---

## Task 3: Client request timeout (WB-019, part 1)

**Files:**
- Modify: `backend/src/modules/wheel-size/client.ts`
- Modify: `backend/src/modules/wheel-size/service.ts` (pass `timeoutMs` to the client)
- Test: `backend/src/modules/wheel-size/__tests__/client.test.ts`

**Interfaces:**
- Produces: `WheelSizeClient` constructor gains `timeoutMs?: number` (default 5000); a fetch that exceeds it resolves to `{ status: 408, empty: true, body: null }`.
- Consumes: `options.requestTimeoutMs` from the service.

- [ ] **Step 1: Write the failing test.** Add to `client.test.ts`:

```ts
it("returns 408 when the fetch exceeds the timeout", async () => {
  const neverResolves = () => new Promise<any>(() => {}) // hangs
  const c = new WheelSizeClient({ apiKey: "k", baseUrl: "https://api.wheel-size.com/v2", fetchImpl: neverResolves, timeoutMs: 20 })
  const r = await c.byModel({ make: "x", model: "y", year: "2020", region: "usdm" })
  expect(r.status).toBe(408)
  expect(r.empty).toBe(true)
  expect(r.body).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail.** `cd backend && pnpm test:fitment -- client` → FAIL (hangs/times out the jest case, or status undefined).

- [ ] **Step 3: Implement.** In `client.ts`: extend the `FetchImpl` type and the constructor, and race the fetch against a timeout in `get`:

```ts
type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>
export type ClientResult = { status: number; empty: boolean; body: any | null }

export class WheelSizeClient {
  private apiKey: string
  private baseUrl: string
  private fetchImpl: FetchImpl
  private timeoutMs: number
  constructor(opts: { apiKey: string; baseUrl: string; fetchImpl?: FetchImpl; timeoutMs?: number }) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init) as any)
    this.timeoutMs = opts.timeoutMs ?? 5000
  }
  private async get(path: string, params: Record<string, string>): Promise<ClientResult> {
    const qs = new URLSearchParams({ ...params, user_key: this.apiKey }).toString()
    const controller = new AbortController()
    let timer: any
    const timeoutP = new Promise<{ __timeout: true }>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve({ __timeout: true }) }, this.timeoutMs)
    })
    let res: any
    try {
      res = await Promise.race([this.fetchImpl(`${this.baseUrl}${path}?${qs}`, { signal: controller.signal }), timeoutP])
    } catch {
      // network error or abort that rejected — treat as a transient outage
      clearTimeout(timer)
      return { status: 408, empty: true, body: null }
    }
    clearTimeout(timer)
    if (res && res.__timeout) return { status: 408, empty: true, body: null }
    const text = await res.text()
    const empty = text.length === 0
    let body: any = null
    if (!empty) { try { body = JSON.parse(text) } catch { body = null } }
    return { status: res.status, empty, body }
  }
  // ...byModel/makes/models/years/modifications unchanged...
}
```

- [ ] **Step 4: Pass `timeoutMs` from the service.** In `service.ts` constructor, where the client is built, add `timeoutMs: options.requestTimeoutMs ?? 5000`:

```ts
    this.client_ = new WheelSizeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? "https://api.wheel-size.com/v2",
      timeoutMs: options.requestTimeoutMs ?? 5000,
    })
```

And extend the `Options` type: `type Options = { apiKey: string; baseUrl?: string; defaultRegion?: string; dailyCeiling?: number; requestTimeoutMs?: number; ttlDays?: number; warmBatchSize?: number }` (the latter two are used in Tasks 4/6 — declare them all now to avoid churn).

- [ ] **Step 5: Run, verify pass + tsc.** `cd backend && pnpm test:fitment && npx tsc --noEmit` → PASS, 0 errors. (A timeout that maps to status 408 ≥ 300 → `resolveByModel` already throws `QuotaOutageError` → the route's existing 503. No route change needed.)

- [ ] **Step 6: Commit.**

```bash
git add backend/src/modules/wheel-size/client.ts backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/__tests__/client.test.ts
git commit -m "feat(wheel-size): bound client fetches with an AbortController timeout (WB-019)"
```

---

## Task 4: TTL + stale-while-revalidate + `refreshFitment` upsert (WB-008 + WB-019, part 2)

**Files:**
- Modify: `backend/src/modules/wheel-size/service.ts`
- Test: `backend/src/modules/wheel-size/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `isStale` (Task 1), `options.ttlDays`.
- Produces: `refreshFitment(p)` (upserts a cache row); `getFitment` serves stale-while-revalidate. Read contract unchanged.

- [ ] **Step 1: Write the failing test.** Add to `service.test.ts` (the `makeService` helper stores rows in a Map; extend it to support an `updateWheelSizeFitments` stub + seed a stale row). Add:

```ts
describe("WheelSizeService.getFitment TTL / stale-while-revalidate (WB-008)", () => {
  it("serves a fresh cached row without calling the client", async () => {
    const { svc } = makeService([]) // client throws if called (no results)
    const fresh = { cache_key: "honda|accord|m|usdm", status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6410, region: "usdm", fetched_at: new Date(), diameter_window: null, width_window: null, offset_window: null, raw: {} }
    ;(svc as any).listWheelSizeFitments = async () => [fresh]
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.canonicalBoltPatterns).toEqual(["5x114.3"])
  })

  it("serves a STALE cached row immediately AND fires a background refresh", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const stale = { cache_key: "honda|accord|m|usdm", status: "ok", canonical_bolt_patterns: ["5x114.3"], hub_bore_mm_x100: 6410, region: "usdm", fetched_at: old, diameter_window: null, width_window: null, offset_window: null, raw: {} }
    const { svc } = makeService([{ status: 200, empty: false, body: { data: [{ technical: { stud_holes: 5, pcd: 120, centre_bore: 72.6 }, wheels: [] } ] } }], { ttlDays: 90 })
    ;(svc as any).listWheelSizeFitments = async () => [stale]
    let refreshed = false
    ;(svc as any).refreshFitment = async () => { refreshed = true }
    const f = await svc.getFitment({ make: "honda", model: "accord", modificationSlug: "m", region: "usdm" })
    expect(f.canonicalBoltPatterns).toEqual(["5x114.3"]) // stale value served immediately
    await new Promise((r) => setTimeout(r, 0)) // let the fire-and-forget run
    expect(refreshed).toBe(true)
  })
})
```

- [ ] **Step 2: Run, verify fail.** `cd backend && pnpm test:fitment -- service` → FAIL (no TTL branch; refresh not called).

- [ ] **Step 3: Implement.** In `service.ts`: store `this.ttlDays_ = options?.ttlDays ?? 90` in the constructor. Refactor `getFitment` so the cache-hit branch checks staleness, and extract the write into `refreshFitment` (an upsert):

```ts
  async getFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region?: string }): Promise<VehicleFitment> {
    const region = p.region ?? this.options_.defaultRegion ?? "usdm"
    const cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), region].join("|")

    const cached = await this.listWheelSizeFitments({ cache_key })
    if (cached[0]) {
      const c = cached[0]
      if (isStale(c.fetched_at as any, this.ttlDays_, new Date())) {
        // serve stale immediately; refresh in the background (never awaited)
        void this.refreshFitment({ ...p, region }).catch((e) =>
          this.logger_.warn(`[wheel-size] background refresh failed for ${cache_key}: ${e?.message ?? e}`)
        )
      }
      return this.toFitment(c, region, p.modificationSlug)
    }

    return this.refreshFitment({ ...p, region })
  }

  /** Map a cache row to the VehicleFitment read contract. */
  private toFitment(c: any, region: string, modificationSlug?: string): VehicleFitment {
    return {
      status: c.status as VehicleFitment["status"],
      canonicalBoltPatterns: (c.canonical_bolt_patterns as unknown as string[]) ?? [],
      hubBoreMm: c.hub_bore_mm_x100 == null ? null : (c.hub_bore_mm_x100 as number) / 100,
      diameterWindow: (c.diameter_window as unknown as Window) ?? null,
      widthWindow: (c.width_window as unknown as Window) ?? null,
      offsetWindow: (c.offset_window as unknown as Window) ?? null,
      source: { modificationSlug: modificationSlug ?? "", region: c.region ?? region },
    }
  }

  /** Fetch live + upsert the cache row by cache_key. Returns the fresh fitment. */
  async refreshFitment(p: { make: string; model: string; modificationSlug?: string; year?: string; region: string }): Promise<VehicleFitment> {
    const cache_key = [p.make, p.model, (p.modificationSlug ?? p.year ?? ""), p.region].join("|")
    const { body, regionUsed } = await this.resolveByModel(p)
    const fitment = normalizeByModel(body, { modificationSlug: p.modificationSlug ?? "", region: regionUsed })
    const row = {
      cache_key, region: regionUsed, raw: body,
      canonical_bolt_patterns: fitment.canonicalBoltPatterns as unknown as Record<string, unknown>,
      hub_bore_mm_x100: fitment.hubBoreMm == null ? null : Math.round(fitment.hubBoreMm * 100),
      diameter_window: fitment.diameterWindow, width_window: fitment.widthWindow, offset_window: fitment.offsetWindow,
      status: fitment.status, fetched_at: new Date(),
    }
    const existing = await this.listWheelSizeFitments({ cache_key })
    if (existing[0]) await this.updateWheelSizeFitments({ id: existing[0].id, ...row })
    else await this.createWheelSizeFitments(row)
    return fitment
  }
```

Add the import at the top: `import { isStale } from "./staleness"`. (The old inline cache-hit return block and the old create-write are now replaced by `toFitment` + `refreshFitment` — delete them.)

- [ ] **Step 4: Run, verify pass + tsc.** `cd backend && pnpm test:fitment && npx tsc --noEmit` → PASS (incl. the existing "returns the cached row on the second call" + region-fallback tests — they exercise `refreshFitment` via the miss path), 0 errors.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/__tests__/service.test.ts
git commit -m "feat(wheel-size): TTL + stale-while-revalidate via refreshFitment upsert (WB-008/WB-019)"
```

---

## Task 5: Atomic quota counter (WB-020)

**Files:**
- Modify: `backend/src/modules/wheel-size/service.ts`
- Test: `backend/src/modules/wheel-size/__tests__/service.test.ts`

**Interfaces:**
- Consumes: the module container's knex connection (`ContainerRegistrationKeys.PG_CONNECTION`).
- Produces: `incrementAndCheckQuota()` performs one atomic upsert-increment and compares to the ceiling.

- [ ] **Step 1: Write the failing test.** Add to `service.test.ts` (construct a service whose `knex_` is stubbed):

```ts
describe("WheelSizeService.incrementAndCheckQuota (WB-020)", () => {
  function makeQuotaService(returnedCount: number, ceiling = 5000) {
    const svc = new (WheelSizeService as any)({ logger: { warn() {}, error() {} } }, { apiKey: "k", baseUrl: "b", dailyCeiling: ceiling })
    const calls: string[] = []
    svc.knex_ = { raw: async (sql: string) => { calls.push(sql); return { rows: [{ count: returnedCount }] } } }
    return { svc, calls }
  }
  it("returns true when the atomic count is at/under the ceiling", async () => {
    const { svc, calls } = makeQuotaService(4999, 5000)
    expect(await svc.incrementAndCheckQuota()).toBe(true)
    expect(calls[0]).toMatch(/insert into "wheel_size_quota"[\s\S]*on conflict[\s\S]*count = "wheel_size_quota"\."count" \+ 1[\s\S]*returning "count"/i)
  })
  it("returns false when the atomic count exceeds the ceiling", async () => {
    const { svc } = makeQuotaService(5001, 5000)
    expect(await svc.incrementAndCheckQuota()).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify fail.** `cd backend && pnpm test:fitment -- service` → FAIL (`knex_` unused; still does list/create).

- [ ] **Step 3: Implement.** In `service.ts`: grab the connection in the constructor and rewrite `incrementAndCheckQuota`. Add the import `import { ContainerRegistrationKeys } from "@medusajs/framework/utils"` (extend the existing import). In the constructor:

```ts
    this.knex_ = container?.[ContainerRegistrationKeys.PG_CONNECTION]
```

and declare `protected knex_: any`. Replace `incrementAndCheckQuota`:

```ts
  async incrementAndCheckQuota(): Promise<boolean> {
    const day = this.gmtDay()
    const id = `wsq_${day.replace(/-/g, "")}`
    // Atomic upsert-increment against the partial unique index (day) WHERE deleted_at IS NULL.
    const result = await this.knex_.raw(
      `insert into "wheel_size_quota" ("id", "day", "count", "created_at", "updated_at")
       values (?, ?, 1, now(), now())
       on conflict ("day") where deleted_at is null
       do update set "count" = "wheel_size_quota"."count" + 1, "updated_at" = now()
       returning "count"`,
      [id, day]
    )
    const count = Number(result?.rows?.[0]?.count ?? Number.MAX_SAFE_INTEGER)
    return count <= this.ceiling_
  }
```

(The deterministic `id` per day avoids a separate uuid dependency and is harmless — `ON CONFLICT (day)` is what actually dedupes. Existing tests stub `incrementAndCheckQuota` directly, so they are unaffected.)

- [ ] **Step 4: Run, verify pass + tsc.** `cd backend && pnpm test:fitment && npx tsc --noEmit` → PASS, 0 errors.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/modules/wheel-size/service.ts backend/src/modules/wheel-size/__tests__/service.test.ts
git commit -m "fix(wheel-size): atomic upsert-increment quota counter (WB-020)"
```

---

## Task 6: Nightly warm cron (WB-008, part 2)

**Files:**
- Create: `backend/src/jobs/wheel-size-warm.ts`
- (Reuses `selectStaleForWarm` from Task 1 + `refreshFitment` from Task 4 — covered by their tests.)

**Interfaces:**
- Consumes: `selectStaleForWarm` (Task 1), `service.refreshFitment` / `service.incrementAndCheckQuota` / `service.listWheelSizeFitments`.

- [ ] **Step 1: Implement the cron.** Create `wheel-size-warm.ts` (mirrors `vendor-sync-tick.ts`):

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { WHEEL_SIZE_MODULE } from "../modules/wheel-size"
import { resolveOptional } from "../lib/resolve-optional"
import { selectStaleForWarm } from "../modules/wheel-size/staleness"
import type WheelSizeService from "../modules/wheel-size/service"

export default async function wheelSizeWarm(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const svc = resolveOptional<WheelSizeService>(container, WHEEL_SIZE_MODULE)
  if (!svc) { logger.info("[wheel-size-warm] module not loaded, skipping"); return }

  const ttlDays = (svc as any).ttlDays_ ?? 90
  const batch = (svc as any).options_?.warmBatchSize ?? 200

  const rows = await (svc as any).listWheelSizeFitments({})
  const stale = selectStaleForWarm(rows as any[], ttlDays, new Date(), batch)
  logger.info(`[wheel-size-warm] ${stale.length} stale entr${stale.length === 1 ? "y" : "ies"} to refresh (batch ${batch})`)

  let refreshed = 0
  for (const row of stale) {
    // Stop early if we are out of daily quota (each refresh costs ≥1 call).
    if (!(await svc.incrementAndCheckQuota())) { logger.warn("[wheel-size-warm] quota exhausted, stopping"); break }
    const p = parseCacheKey(row.cache_key)
    if (!p) continue
    try { await (svc as any).refreshFitment(p); refreshed++ }
    catch (e: any) { logger.warn(`[wheel-size-warm] refresh failed for ${row.cache_key}: ${e?.message ?? e}`) }
  }
  logger.info(`[wheel-size-warm] refreshed ${refreshed}/${stale.length}`)
}

// cache_key = `${make}|${model}|${modificationSlug||year||""}|${region}`. The middle
// slot is opaque (trim slug OR year); pass it as modificationSlug — refreshFitment
// only uses it to rebuild the same cache_key, so the round-trip is exact.
function parseCacheKey(key: string): { make: string; model: string; modificationSlug?: string; region: string } | null {
  const parts = String(key).split("|")
  if (parts.length < 4) return null
  const [make, model, mid, region] = parts
  return { make, model, modificationSlug: mid || undefined, region }
}

export const config = {
  name: "wheel-size-warm",
  schedule: "0 3 * * *",
}
```

> Note: `incrementAndCheckQuota` is called once here as a pre-check before each refresh; `refreshFitment` → `resolveByModel` also increments per upstream call. That double-counts slightly toward the 5000 ceiling — acceptable (conservative; the warm batch of ≤200 is far under the ceiling). Keep it simple.

- [ ] **Step 2: Verify it compiles + the suite stays green.** `cd backend && npx tsc --noEmit && pnpm test:fitment` → 0 errors, green. (No new unit test — the cron is thin glue over `selectStaleForWarm` (Task 1 tested) + `refreshFitment` (Task 4 tested); an integration test would need a live DB + API.)

- [ ] **Step 3: Commit.**

```bash
git add backend/src/jobs/wheel-size-warm.ts
git commit -m "feat(wheel-size): nightly warm cron refreshes stale fitment (WB-008)"
```

---

## Task 7: Config wiring (options + env + template)

**Files:**
- Modify: `backend/src/lib/constants.ts`
- Modify: `backend/medusa-config.js`
- Modify: `backend/.env.template`

**Interfaces:**
- Produces: `ttlDays` / `requestTimeoutMs` / `warmBatchSize` reaching the wheel-size module `options` with safe defaults.

- [ ] **Step 1: Add env constants.** In `constants.ts`, after the existing `WHEEL_SIZE_REGION` line:

```ts
export const WHEEL_SIZE_TTL_DAYS = process.env.WHEEL_SIZE_TTL_DAYS
export const WHEEL_SIZE_TIMEOUT_MS = process.env.WHEEL_SIZE_TIMEOUT_MS
export const WHEEL_SIZE_WARM_BATCH = process.env.WHEEL_SIZE_WARM_BATCH
```

- [ ] **Step 2: Thread into the module options.** In `medusa-config.js`, add the three to the `lib/constants` import list, and extend the wheel-size module `options` block (after `dailyCeiling: 5000,`):

```js
        ttlDays: WHEEL_SIZE_TTL_DAYS ? Number(WHEEL_SIZE_TTL_DAYS) : 90,
        requestTimeoutMs: WHEEL_SIZE_TIMEOUT_MS ? Number(WHEEL_SIZE_TIMEOUT_MS) : 5000,
        warmBatchSize: WHEEL_SIZE_WARM_BATCH ? Number(WHEEL_SIZE_WARM_BATCH) : 200,
```

- [ ] **Step 3: Document in `.env.template`.** Near the existing `WHEEL_SIZE_*` entries add:

```
# wheel-size fitment cache tuning (all optional; defaults shown)
WHEEL_SIZE_TTL_DAYS=90
WHEEL_SIZE_TIMEOUT_MS=5000
WHEEL_SIZE_WARM_BATCH=200
```

- [ ] **Step 4: Verify.** `cd backend && npx tsc --noEmit && pnpm test:fitment` → 0 errors, green. (No behavior test — defaults already exercised in Tasks 3–6; this only routes env → options.)

- [ ] **Step 5: Commit.**

```bash
git add backend/src/lib/constants.ts backend/medusa-config.js backend/.env.template
git commit -m "feat(wheel-size): wire ttlDays/timeout/warmBatch env options (WB-008/019)"
```

---

## Task 8: Gated live-slug verification test (WB-043)

**Files:**
- Create: `backend/src/modules/wheel-size/__tests__/live-slug.test.ts`

- [ ] **Step 1: Implement the gated test.** Create `live-slug.test.ts`:

```ts
// Live wheel-size by_model slug check. SKIPPED by default so `pnpm test:fitment`
// stays offline. Run against the real API with:
//   RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=<key> pnpm test:fitment -- live-slug
import { WheelSizeClient } from "../client"

const RUN = process.env.RUN_WHEEL_SIZE_LIVE === "true" && !!process.env.WHEEL_SIZE_API_KEY
const d = RUN ? describe : describe.skip

d("wheel-size live by_model slug resolution (WB-043)", () => {
  it("resolves a known YMM slug to fitment with a usable bolt pattern", async () => {
    const c = new WheelSizeClient({
      apiKey: process.env.WHEEL_SIZE_API_KEY as string,
      baseUrl: process.env.WHEEL_SIZE_BASE_URL ?? "https://api.wheel-size.com/v2",
      timeoutMs: 10000,
    })
    const r = await c.byModel({ make: "honda", model: "accord", year: "2021", region: "usdm" })
    expect(r.status).toBe(200)
    const tech = r.body?.data?.[0]?.technical
    expect(typeof tech?.stud_holes).toBe("number")
    expect(typeof tech?.pcd).toBe("number")
  }, 15000)
})
```

- [ ] **Step 2: Verify offline-skip + tsc.** `cd backend && npx tsc --noEmit && pnpm test:fitment` → the live test reports skipped; suite green.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/modules/wheel-size/__tests__/live-slug.test.ts
git commit -m "test(wheel-size): gated live by_model slug verification (WB-043)"
```

---

## Task 9: Verification + doc close-out

**Files:**
- Modify: `docs/STATUS.md`, `docs/future/BACKLOG.md`
- Move: spec + plan `docs/in-progress/` → `docs/done/`

- [ ] **Step 1: Full gate.** `cd backend && npx tsc --noEmit && pnpm test:fitment` → 0 errors, green (incl. the new staleness/timeout/TTL/quota tests; live-slug skipped).

- [ ] **Step 2: Optional live confirmation.** With a real key: `RUN_WHEEL_SIZE_LIVE=true WHEEL_SIZE_API_KEY=<key> pnpm test:fitment -- live-slug` → passes; and (post-deploy) the migration `Migration20260623120000` runs clean against the DB.

- [ ] **Step 3: `/doc-review`**, then update docs: flip WB-007/008/019/020/043 `in-progress` → `done` with `done:` lines + evidence; bump STATUS "Last verified" + the Fitment pillar row (TTL/warm/timeout/atomic-quota/fractional-bore); move spec + plan to `docs/done/`.

- [ ] **Step 4: Commit.**

```bash
git add docs/
git commit -m "docs(wheel-size): close WB-007/008/019/020/043 — fitment hardening"
```

---

## Self-Review

**Spec coverage:** WB-007 → Task 2. WB-008 → Tasks 1 (staleness) + 4 (stale-while-revalidate) + 6 (warm cron) + 7 (ttlDays). WB-019 → Task 3 (timeout) + 4 (stale-revalidate, no block on refresh). WB-020 → Task 5. WB-043 → Task 8. Config → Task 7. Verification/close-out → Task 9.

**Type consistency:** `hub_bore_mm_x100` (integer hundredths) used uniformly in the model, migration, snapshot, `service.refreshFitment` write, `service.toFitment` read, and `reverse-fitment.matchedPattern`; `VehicleFitment.hubBoreMm` stays fractional mm everywhere. `isStale`/`selectStaleForWarm` signatures (Task 1) match their consumers (Tasks 4, 6). `Options` gains `requestTimeoutMs`/`ttlDays`/`warmBatchSize` in Task 3 and is read in Tasks 3/4/6/7. `refreshFitment(p)` signature is consistent across `getFitment`, the warm cron, and the stale-refresh test.

**Placeholder scan:** every code step has full code; commands have expected output; `<key>` in Task 8/9 is an operator-supplied secret, not a plan gap. The one judgement call (warm-cron double-counts quota by ≤1/refresh) is documented as accepted, not deferred.
