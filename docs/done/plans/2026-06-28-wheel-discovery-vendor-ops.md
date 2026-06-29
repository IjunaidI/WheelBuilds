# Wheel Discovery & Vendor-Sync Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden wheel discovery (cache Meili, remove the dead category facet) and make the vendor-sync pipeline operable from the admin (CLI-free console), plus two ops fixes (scale-safe wipe, honest fixtures).

**Architecture:** Six independent tasks across backend (vendor-sync scripts + a Medusa admin route extension) and storefront (discovery data layer + filter rail). No new backend API routes — the admin console consumes the 8 existing `/admin/vendor-sync/*` routes. No DB migration. Tires untouched.

**Tech Stack:** MedusaJS 2.13.6 (admin extensions via `@medusajs/admin-sdk` + `@medusajs/ui` + `@medusajs/icons`), Next.js 15 / React 19 storefront, Meilisearch (`@rokmohar/medusa-plugin-meilisearch`), backend jest (`@swc/jest`), storefront vitest.

## Global Constraints

- **No `wb-` / `WB` / `wheelbuilds-` prefixes** on any dir, file, export, type, or CSS class. The project name (Wheel Builds) is implied.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **`MedusaService` create/update take a SINGLE object** — `service.updateVendorFeedRuns({ id, ...fields })`, never `({id}, {fields})`.
- **Storefront build ignores TS/lint** (`ignoreBuildErrors`/`ignoreDuringBuilds`) — run `npx tsc --noEmit` + `pnpm lint` separately; do not rely on the build to catch type errors.
- **Backend jest** matches `src/**/*.test.ts`, transformed by `@swc/jest`, `testEnvironment: node`. Test scripts are path-scoped (`test:sync`, `test:fitment`, `test:config`, `test:newsletter`).
- **`pnpm` may not be on PATH (Windows).** Use `npx -y pnpm@9.10.0 <cmd>` or invoke jest/vitest via `npx`.
- **Tires (WB-005), pricing/de-hardcode (WB-024/025/026), reply-to/shipping (WB-031) are OUT OF SCOPE.**
- **Prod DB is live** behind `backend/.env`. No task here runs a destructive/live op — scripts are only refactored, never executed against prod.

## File structure

**Backend — WB-052 (scale-safe wipe)**
- Create `backend/src/modules/vendor-sync/utils/truncate-state.ts` — `VENDOR_STATE_TABLES` + `truncateVendorState(knex)`, the single source of truth for the TRUNCATE.
- Create `backend/src/modules/vendor-sync/__tests__/truncate-state.test.ts`.
- Modify `backend/src/scripts/vendor-sync-truncate-state.ts` — import the shared helper.
- Modify `backend/src/scripts/vendor-sync-dev-wipe.ts` — delegate state deletion to the helper (keep product-purge path).

**Backend — WB-044 (honest fixtures)**
- Modify `__tests__/build-search-document.test.ts`, `build-metadata.test.ts`, `hash.test.ts`, `wheel-normalize.test.ts`, `__fixtures__/wheels-small.csv`, `__fixtures__/wheels-small-v2.csv` (all under `backend/src/modules/vendor-sync/`).

**Backend — WB-006 (admin console)**
- Create `backend/src/admin/routes/vendor-sync/status-actions.ts` — pure helpers (`actionsForStatus`, `badgeForStatus`, `isNonTerminal`).
- Create `backend/src/admin/routes/vendor-sync/__tests__/status-actions.test.ts`.
- Create `backend/src/admin/routes/vendor-sync/api.ts` — fetch helpers over the existing routes.
- Create `backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx` — detail drawer + replay-SKU.
- Create `backend/src/admin/routes/vendor-sync/page.tsx` — the route (list + filters + trigger + actions).
- Modify `backend/package.json` — add `test:admin` script.

**Storefront — WB-046 (remove dead facet) + WB-021 (cache)**
- Modify `storefront/src/modules/discovery/data/types.ts`, `get-products.ts`, `components/filter-rail/filter-sections.tsx`.
- Create `storefront/src/modules/discovery/data/cache-key.ts` + `__tests__/cache-key.test.ts`.

---

### Task 1: WB-052 — shared `truncateVendorState` helper

**Files:**
- Create: `backend/src/modules/vendor-sync/utils/truncate-state.ts`
- Test: `backend/src/modules/vendor-sync/__tests__/truncate-state.test.ts`
- Modify: `backend/src/scripts/vendor-sync-truncate-state.ts`, `backend/src/scripts/vendor-sync-dev-wipe.ts`

**Interfaces:**
- Produces: `VENDOR_STATE_TABLES: string[]` and `async function truncateVendorState(knex: any): Promise<void>` — issues one `TRUNCATE TABLE … RESTART IDENTITY` over all four state tables.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/vendor-sync/__tests__/truncate-state.test.ts
import {
  VENDOR_STATE_TABLES,
  truncateVendorState,
} from "../utils/truncate-state"

describe("truncateVendorState", () => {
  it("covers exactly the four vendor-sync state tables", () => {
    expect(VENDOR_STATE_TABLES).toEqual([
      "vendor_feed_run",
      "vendor_feed_staging",
      "vendor_stock_staging",
      "vendor_product_current",
    ])
  })

  it("issues a single TRUNCATE ... RESTART IDENTITY over all tables", async () => {
    const calls: string[] = []
    const knex = { raw: async (sql: string) => { calls.push(sql); return undefined } }
    await truncateVendorState(knex)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(
      "TRUNCATE TABLE vendor_feed_run, vendor_feed_staging, vendor_stock_staging, vendor_product_current RESTART IDENTITY"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/truncate-state.test.ts`
Expected: FAIL — `Cannot find module '../utils/truncate-state'`.

- [ ] **Step 3: Write the helper**

```ts
// backend/src/modules/vendor-sync/utils/truncate-state.ts

/**
 * Single source of truth for resetting vendor-sync STATE (NOT Medusa products).
 *
 * One `TRUNCATE ... RESTART IDENTITY` over all four tables — instant regardless
 * of row count. Both vendor-sync-truncate-state.ts and vendor-sync-dev-wipe.ts
 * delegate here, so neither hits the knex `WHERE id IN (...)` stack-overflow that
 * the per-id bulk-delete used to cause at production scale (~372k staging rows).
 */
export const VENDOR_STATE_TABLES = [
  "vendor_feed_run",
  "vendor_feed_staging",
  "vendor_stock_staging",
  "vendor_product_current",
] as const

export async function truncateVendorState(knex: any): Promise<void> {
  // Truncating all four together resolves any inter-table FKs in one statement.
  await knex.raw(
    `TRUNCATE TABLE ${VENDOR_STATE_TABLES.join(", ")} RESTART IDENTITY`
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/vendor-sync/__tests__/truncate-state.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor `vendor-sync-truncate-state.ts` to use the helper**

In `backend/src/scripts/vendor-sync-truncate-state.ts`: replace the local `const TABLES = [...]` (lines ~27-32) with an import, and replace the inline `knex.raw(...)` (line ~108) with the helper call. Keep everything else (guards, logging) unchanged.

Replace the `TABLES` declaration:

```ts
import { VENDOR_STATE_TABLES, truncateVendorState } from "../modules/vendor-sync/utils/truncate-state"

const TABLES = VENDOR_STATE_TABLES
```

Replace the truncate line (`await knex.raw(\`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY\`)`):

```ts
  await truncateVendorState(knex)
```

- [ ] **Step 6: Refactor `vendor-sync-dev-wipe.ts` to delegate state deletion**

In `backend/src/scripts/vendor-sync-dev-wipe.ts`, the overflow is the per-id collect + `WHERE id IN (...)`. Resolve the knex connection and TRUNCATE the state tables instead. Keep the `--purge-products` Medusa-product path exactly as-is (it already chunks at 50).

Add the imports near the top (alongside the existing imports):

```ts
import {
  VENDOR_STATE_TABLES,
  truncateVendorState,
} from "../modules/vendor-sync/utils/truncate-state"
```

Resolve knex next to the other container resolves (after `const productService = ...`):

```ts
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
```

Replace the whole id-collection block (the `let runIds … ` declarations through the four `for (const vendorCode of VENDORS) { … }` loop and the four `service.delete…` calls — lines ~159-229) with the product-purge (unchanged) followed by a single TRUNCATE:

```ts
  // Delete Medusa products first (so references to vendor_product_current are
  // gone before we drop those rows). The workflow handles variant + inventory
  // cleanup via its hooks. Bounded by CHUNK so the workflow input stays small.
  if (purgeProducts && productIdsToDelete.length > 0) {
    const CHUNK = 50
    for (let i = 0; i < productIdsToDelete.length; i += CHUNK) {
      const chunk = productIdsToDelete.slice(i, i + CHUNK)
      logger.info(
        `[wipe] Deleting Medusa products ${i + 1}..${i + chunk.length} of ${productIdsToDelete.length}...`
      )
      await deleteProductsWorkflow(container).run({ input: { ids: chunk } })
    }
  }

  // Then the vendor-sync state. One TRUNCATE over all four tables — instant at
  // any scale, and immune to the knex `WHERE id IN (...)` stack overflow the old
  // per-id delete hit on large staging tables (WB-052).
  logger.info(`[wipe] Truncating state tables: ${VENDOR_STATE_TABLES.join(", ")}`)
  await truncateVendorState(knex)
```

Note: `VENDORS` is still used for the product-purge filter and the logging header, so leave it. The `service.listVendorFeedStagings`/`deleteVendorFeedStagings` etc. calls are removed; the `productIdsToDelete` discovery block above them stays.

- [ ] **Step 7: Run the full vendor-sync suite to confirm nothing regressed**

Run: `cd backend && npx jest src/modules/vendor-sync`
Expected: PASS (existing suite + the 2 new truncate-state tests).

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/vendor-sync/utils/truncate-state.ts \
  backend/src/modules/vendor-sync/__tests__/truncate-state.test.ts \
  backend/src/scripts/vendor-sync-truncate-state.ts \
  backend/src/scripts/vendor-sync-dev-wipe.ts
git commit -m "$(cat <<'EOF'
fix(vendor-sync): scale-safe dev-wipe via shared truncateVendorState (WB-052)

dev-wipe collected every state-row id and issued WHERE id IN (...), which
overflows knex at prod scale. Extract the atomic TRUNCATE into a shared helper;
dev-wipe + truncate-state both delegate to it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: WB-044 — rename teraflex fixtures → Petrol

**Files:**
- Modify: `backend/src/modules/vendor-sync/__tests__/build-search-document.test.ts`, `build-metadata.test.ts`, `hash.test.ts`, `wheel-normalize.test.ts`
- Modify: `backend/src/modules/vendor-sync/__fixtures__/wheels-small.csv`, `wheels-small-v2.csv`

**Interfaces:** none — pure fixture rename, no behavior change.

- [ ] **Step 1: Find every occurrence (confirm the map)**

Run: `cd backend && npx grep -rin "teraflex" src/modules/vendor-sync` *(or use the editor's search)*.
Expected: occurrences in the 6 files above (≈13 test refs + ≈10 CSV rows). Note any extra file the original map missed and include it in the rename.

- [ ] **Step 2: Rename the brand token everywhere**

Replace **`Teraflex` → `Petrol`** and **`teraflex` → `petrol`** across all matched files, preserving the rest of every string. This keeps each fixture structurally identical — only the (misleading, non-wheel) brand changes:
- `handle: "teraflex-nomad-matte-black"` → `"petrol-nomad-matte-black"`
- `title: "Teraflex Nomad Matte Black"` → `"Petrol Nomad Matte Black"`
- `brand: "Teraflex"` → `brand: "Petrol"`
- `groupKey: "Teraflex|058|Matte Black"` → `"Petrol|058|Matte Black"` (carried-through literal — the build-metadata/hash tests assert group_key copies through, not the grouping rule; structure unchanged)
- `expect(result.groupKey).toBe('Teraflex|058')` → `'Petrol|058'`
- CSV `Brand` column cells `Teraflex` → `Petrol` (both files, all data rows)

Do **not** change `058`, `Nomad`, `Matte Black`, offsets, SKUs, or any non-brand token.

- [ ] **Step 3: Run the WHOLE vendor-sync suite (not just touched files)**

Run: `cd backend && npx jest src/modules/vendor-sync`
Expected: PASS. (A prior session shipped a stale assertion by running only the touched file — a sibling held the old value. Run the whole module suite.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/vendor-sync/__tests__ backend/src/modules/vendor-sync/__fixtures__
git commit -m "$(cat <<'EOF'
test(vendor-sync): rename misleading teraflex fixtures to Petrol (WB-044)

Teraflex makes Jeep suspension, not wheels. Rename the fixture brand to a real
wheel brand (Petrol) across tests + CSVs; structure/assertions unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: WB-046 — remove the dead category facet

**Files:**
- Modify: `storefront/src/modules/discovery/data/types.ts`
- Modify: `storefront/src/modules/discovery/data/get-products.ts`
- Modify: `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx`

**Interfaces:**
- Produces: `DiscoveryProduct`, `DiscoveryFilters`, `FacetCounts` **without** a `categories` member; `EMPTY_FILTERS` without `categories`. Task 4 (cache-key) consumes the trimmed `DiscoveryFilters`.

- [ ] **Step 1: Sweep for every `categories` reference in discovery**

Run: `cd storefront && npx grep -rin "categories" src/modules/discovery`
Expected: hits in `data/types.ts`, `data/get-products.ts`, `components/filter-rail/filter-sections.tsx`, and possibly `data/use-discovery-query.ts` / `components/active-chips/*`. Every hit below must be resolved; if the sweep surfaces a consumer not listed here (e.g. an active-chip rendering categories), remove that reference too.

- [ ] **Step 2: Trim `types.ts`**

In `storefront/src/modules/discovery/data/types.ts`:
- Remove the `categories: string[]` member + its `/** Category slugs … */` doc from `DiscoveryProduct`.
- Remove `categories: string[]` from `DiscoveryFilters`.
- Remove `categories: [],` from `EMPTY_FILTERS`.
- Remove `categories: Record<string, number>` from `FacetCounts`.
- In `parseQueryFromSearchParams`, remove the `categories: arr("categories"),` line from the returned `filters` object.

- [ ] **Step 3: Trim `get-products.ts`**

In `storefront/src/modules/discovery/data/get-products.ts`:
- In `hitToProduct`, remove `categories: [], // Spec §5 G2: no backend source yet.`
- In `emptyResult`, remove `categories: {},` from the `facets` object.
- In the main `facets` object (the `FacetCounts` built after the multiSearch), remove `categories: {}, // Spec §5 G2: no backend source yet.`

- [ ] **Step 4: Trim `filter-sections.tsx`**

In `storefront/src/modules/discovery/components/filter-rail/filter-sections.tsx`:
- Delete the `CATEGORY_LABELS` const (lines ~23-30).
- Delete the `hasCategories` line + its comment (lines ~116-119).
- Delete the entire `{hasCategories && ( … )}` block — the category `AccordionItem` and its trailing `<Separator />` (lines ~163-180).
- In the `<Accordion … defaultValue={["category", "brand", "diameter", "finish"]}>`, drop `"category"` → `defaultValue={["brand", "diameter", "finish"]}`.

- [ ] **Step 5: Typecheck + run discovery unit tests**

Run: `cd storefront && npx tsc --noEmit`
Expected: no NEW errors referencing `categories` in `modules/discovery`. (Pre-existing unrelated errors listed in storefront/CLAUDE.md are acceptable.)
Run: `cd storefront && npx vitest run src/modules/discovery`
Expected: PASS (existing discovery tests, if any, stay green).

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/discovery
git commit -m "$(cat <<'EOF'
refactor(discovery): remove the dead category facet (WB-046)

No category source exists (feed/transformer/index all lack it), so the facet
was permanently empty. Remove the scaffolding (types, empty facet, filter UI,
labels) rather than render dead chrome — matches the WB-029 no-fabricated-content
precedent. Home "shop by style" (STYLE_DEFS) is unrelated and untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: WB-021 — cache discovery Meili queries

**Files:**
- Create: `storefront/src/modules/discovery/data/cache-key.ts`
- Test: `storefront/src/modules/discovery/data/__tests__/cache-key.test.ts`
- Modify: `storefront/src/modules/discovery/data/get-products.ts`

**Interfaces:**
- Consumes: the trimmed `DiscoveryQuery`/`DiscoveryFilters` from Task 3.
- Produces: `discoveryCacheKey(query: DiscoveryQuery): string` — a stable, order-independent cache key. `getDiscoveryProducts` keeps the same signature/return.

- [ ] **Step 1: Write the failing test**

```ts
// storefront/src/modules/discovery/data/__tests__/cache-key.test.ts
import { describe, it, expect } from "vitest"
import { discoveryCacheKey } from "../cache-key"
import { EMPTY_FILTERS, type DiscoveryQuery } from "../types"

const base: DiscoveryQuery = { filters: EMPTY_FILTERS, sort: "relevance", page: 1 }

describe("discoveryCacheKey", () => {
  it("is identical for identical queries", () => {
    expect(discoveryCacheKey(base)).toBe(discoveryCacheKey({ ...base }))
  })

  it("is order-independent within a filter dimension", () => {
    const a: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["FUEL", "RBP"] } }
    const b: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["RBP", "FUEL"] } }
    expect(discoveryCacheKey(a)).toBe(discoveryCacheKey(b))
  })

  it("differs when the page differs", () => {
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey({ ...base, page: 2 }))
  })

  it("differs when a filter value differs", () => {
    const a: DiscoveryQuery = { ...base, filters: { ...EMPTY_FILTERS, brands: ["FUEL"] } }
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey(a))
  })

  it("differs when the free-text query differs", () => {
    expect(discoveryCacheKey(base)).not.toBe(discoveryCacheKey({ ...base, q: "matte" }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storefront && npx vitest run src/modules/discovery/data/__tests__/cache-key.test.ts`
Expected: FAIL — cannot resolve `../cache-key`.

- [ ] **Step 3: Write `cache-key.ts`**

```ts
// storefront/src/modules/discovery/data/cache-key.ts
import type { DiscoveryQuery } from "./types"

/**
 * Stable, order-independent cache key for a DiscoveryQuery. Used as the
 * `unstable_cache` key part so two requests with the same effective filters
 * (regardless of array order) share one cached Meilisearch result.
 */
export function discoveryCacheKey(query: DiscoveryQuery): string {
  const f = query.filters
  const norm = (a: ReadonlyArray<string | number>) =>
    [...a].map(String).sort().join(",")

  return JSON.stringify({
    brands: norm(f.brands),
    diameters: norm(f.diameters),
    boltPatterns: norm(f.boltPatterns),
    finishes: norm(f.finishes),
    priceMin: f.priceMinCents ?? null,
    priceMax: f.priceMaxCents ?? null,
    sort: query.sort,
    page: query.page,
    q: query.q ?? "",
    vehicleConstraint: query.vehicleConstraint
      ? [...query.vehicleConstraint].sort().join("|")
      : "",
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd storefront && npx vitest run src/modules/discovery/data/__tests__/cache-key.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wrap the Meili query in `unstable_cache`**

In `storefront/src/modules/discovery/data/get-products.ts`:

Add imports at the top (after the existing imports):

```ts
import { unstable_cache } from "next/cache"
import { discoveryCacheKey } from "./cache-key"
```

Rename the current exported `getDiscoveryProducts` to a private, **throwing** inner function (remove its `try/catch` + `emptyResult` fallback — caching must NOT cache an empty result during a Meili blip; the outer wrapper handles failure). Rename `export async function getDiscoveryProducts(` to:

```ts
async function fetchDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
```

…and delete this inner `try {` / `} catch (e) { … return emptyResult(pageSize) }` wrapper so the body runs directly and a Meili error propagates (throws). Keep `const pageSize = DEFAULT_PAGE_SIZE` and `const offset = …` at the top of `fetchDiscoveryProducts`.

Then add the new public wrapper at the end of the file:

```ts
/**
 * Cached discovery read. Wraps the Meilisearch multiSearch in Next's
 * unstable_cache (60s TTL, tag "discovery") keyed by the effective query, so
 * repeated discovery/home loads within the window don't re-hit Meili. On a
 * Meili failure the inner fn throws — unstable_cache does NOT cache a throw —
 * and we degrade to an empty result here (never cached, so it self-heals on the
 * next request once Meili recovers). A future re-sync can revalidateTag("discovery").
 */
export async function getDiscoveryProducts(
  query: DiscoveryQuery
): Promise<DiscoveryResult> {
  try {
    const cached = unstable_cache(
      () => fetchDiscoveryProducts(query),
      ["discovery", discoveryCacheKey(query)],
      { revalidate: 60, tags: ["discovery"] }
    )
    return await cached()
  } catch (e) {
    console.error("[discovery] Meilisearch query failed:", e)
    return emptyResult(DEFAULT_PAGE_SIZE)
  }
}
```

`emptyResult` and `DEFAULT_PAGE_SIZE` are already in scope. Confirm `emptyResult` is defined above this wrapper (it is — leave it where it is).

- [ ] **Step 6: Typecheck + full discovery + home tests**

Run: `cd storefront && npx tsc --noEmit`
Expected: no new errors in `modules/discovery`.
Run: `cd storefront && npx vitest run`
Expected: PASS (cache-key tests + all existing storefront tests). The `unstable_cache` wrapper isn't exercised by vitest (no Next runtime); it's verified by typecheck + reasoning.

- [ ] **Step 7: Commit**

```bash
git add storefront/src/modules/discovery/data/cache-key.ts \
  storefront/src/modules/discovery/data/__tests__/cache-key.test.ts \
  storefront/src/modules/discovery/data/get-products.ts
git commit -m "$(cat <<'EOF'
perf(discovery): cache Meili queries with unstable_cache (WB-021)

The multiSearch ran on every discovery/home load (JS client → not fetch-cached).
Wrap it in unstable_cache (60s, tag "discovery") keyed by a stable
discoveryCacheKey. Failures throw past the cache and degrade to empty (uncached),
so a Meili blip self-heals. PDP still reads live, so 60s listing staleness is fine.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: WB-006a — pure status helpers for the admin console

**Files:**
- Create: `backend/src/admin/routes/vendor-sync/status-actions.ts`
- Test: `backend/src/admin/routes/vendor-sync/__tests__/status-actions.test.ts`
- Modify: `backend/package.json` (add `test:admin` script)

**Interfaces:**
- Produces:
  - `type RunAction = "approve" | "cancel" | "replay"`
  - `actionsForStatus(status: string): RunAction[]`
  - `badgeForStatus(status: string): "green" | "orange" | "red" | "blue" | "grey"`
  - `isNonTerminal(status: string): boolean`
  - Task 6 (`page.tsx`, `run-detail-drawer.tsx`) consume all four.

- [ ] **Step 1: Add the `test:admin` jest script**

In `backend/package.json` `scripts`, add (after `test:newsletter`):

```json
    "test:admin": "jest --passWithNoTests src/admin",
```

- [ ] **Step 2: Write the failing test**

```ts
// backend/src/admin/routes/vendor-sync/__tests__/status-actions.test.ts
import {
  actionsForStatus,
  badgeForStatus,
  isNonTerminal,
} from "../status-actions"

describe("actionsForStatus", () => {
  it("offers approve + cancel while awaiting approval", () => {
    expect(actionsForStatus("awaiting_approval")).toEqual(["approve", "cancel"])
  })
  it("offers cancel during in-flight phases", () => {
    for (const s of ["fetching", "staging", "diffing", "applying"]) {
      expect(actionsForStatus(s)).toEqual(["cancel"])
    }
  })
  it("offers replay only for completed/failed (the replay route's source statuses)", () => {
    expect(actionsForStatus("completed")).toEqual(["replay"])
    expect(actionsForStatus("failed")).toEqual(["replay"])
  })
  it("offers nothing for other terminal statuses", () => {
    for (const s of ["cancelled", "exhausted", "partially_failed", "weird"]) {
      expect(actionsForStatus(s)).toEqual([])
    }
  })
})

describe("badgeForStatus", () => {
  it("maps statuses to badge colors", () => {
    expect(badgeForStatus("completed")).toBe("green")
    expect(badgeForStatus("awaiting_approval")).toBe("orange")
    expect(badgeForStatus("partially_failed")).toBe("orange")
    expect(badgeForStatus("failed")).toBe("red")
    expect(badgeForStatus("exhausted")).toBe("red")
    expect(badgeForStatus("cancelled")).toBe("grey")
    expect(badgeForStatus("applying")).toBe("blue")
    expect(badgeForStatus("unknown")).toBe("grey")
  })
})

describe("isNonTerminal", () => {
  it("is true while a run can still change on its own", () => {
    for (const s of ["fetching", "staging", "diffing", "applying", "awaiting_approval"]) {
      expect(isNonTerminal(s)).toBe(true)
    }
  })
  it("is false for terminal statuses", () => {
    for (const s of ["completed", "failed", "cancelled", "exhausted", "partially_failed"]) {
      expect(isNonTerminal(s)).toBe(false)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest src/admin`
Expected: FAIL — cannot resolve `../status-actions`.

- [ ] **Step 4: Write `status-actions.ts`**

```ts
// backend/src/admin/routes/vendor-sync/status-actions.ts
//
// Pure status logic for the vendor-sync admin console. No React / no Medusa
// imports so it unit-tests under jest (the React surface in page.tsx is gated by
// `medusa build`). Mirrors the guards in the existing /admin/vendor-sync routes:
//   - cancel route accepts: awaiting_approval, applying, staging, diffing, fetching
//   - replay route accepts: completed, failed
//   - approve route accepts: awaiting_approval

export type RunAction = "approve" | "cancel" | "replay"

const IN_FLIGHT = ["fetching", "staging", "diffing", "applying"]

export function actionsForStatus(status: string): RunAction[] {
  if (status === "awaiting_approval") return ["approve", "cancel"]
  if (IN_FLIGHT.includes(status)) return ["cancel"]
  if (status === "completed" || status === "failed") return ["replay"]
  return []
}

export function badgeForStatus(
  status: string
): "green" | "orange" | "red" | "blue" | "grey" {
  if (status === "completed") return "green"
  if (status === "awaiting_approval" || status === "partially_failed") return "orange"
  if (status === "failed" || status === "exhausted") return "red"
  if (IN_FLIGHT.includes(status)) return "blue"
  return "grey" // cancelled + anything unknown
}

/** A run that can still change without operator action (so the list should poll). */
export function isNonTerminal(status: string): boolean {
  return status === "awaiting_approval" || IN_FLIGHT.includes(status)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/admin`
Expected: PASS (status-actions suite).

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin/routes/vendor-sync/status-actions.ts \
  backend/src/admin/routes/vendor-sync/__tests__/status-actions.test.ts \
  backend/package.json
git commit -m "$(cat <<'EOF'
feat(admin): pure status helpers for the vendor-sync console (WB-006)

actionsForStatus/badgeForStatus/isNonTerminal mirror the existing route guards;
unit-tested under a new test:admin jest script. Consumed by the admin route next.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: WB-006b — the vendor-sync admin route (list + actions + detail)

**Files:**
- Create: `backend/src/admin/routes/vendor-sync/api.ts`
- Create: `backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx`
- Create: `backend/src/admin/routes/vendor-sync/page.tsx`

**Interfaces:**
- Consumes: `actionsForStatus`, `badgeForStatus`, `isNonTerminal` (Task 5).
- Produces: a sidebar admin route at `/app/vendor-sync`. No exports other tasks rely on.

There is no React test runner in this repo, so this task's gate is **`medusa build` compiling the admin bundle** + a manual review of the JSX. Steps build the files, then verify the build.

- [ ] **Step 1: Write the API helper module**

```ts
// backend/src/admin/routes/vendor-sync/api.ts
//
// Thin fetch helpers over the existing /admin/vendor-sync/* routes. Same-origin
// in the admin, so the session cookie authenticates (credentials: "include").

const BASE = "/admin/vendor-sync"

export const VENDOR_CODES = ["wheelpros-wheels", "wheelpros-tires"] as const

export type VendorRun = {
  id: string
  vendor_code: string
  source_filename: string
  status: string
  row_count: number
  new_count: number
  changed_count: number
  discontinued_count: number
  hash_match_count: number
  skipped_no_image_count: number
  apply_attempt_count: number
  error_message: string | null
  failed_part_numbers: string[] | null
  failed_group_keys: string[] | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any))
    throw new Error(body?.message || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function listRuns(params: { vendor?: string; status?: string; limit?: number }) {
  const q = new URLSearchParams()
  if (params.vendor) q.set("vendor", params.vendor)
  if (params.status) q.set("status", params.status)
  q.set("limit", String(params.limit ?? 25))
  return jsonFetch<{ runs: VendorRun[] }>(`${BASE}/runs?${q.toString()}`)
}

export const getRun = (id: string) => jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}`)

export const triggerRun = (vendor_code: string, dry_run: boolean) =>
  jsonFetch<{ run_id: string }>(`${BASE}/runs`, {
    method: "POST",
    body: JSON.stringify({ vendor_code, dry_run }),
  })

export const approveRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/approve`, { method: "POST" })

export const cancelRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/cancel`, { method: "POST" })

export const replayRun = (id: string) =>
  jsonFetch<{ run: VendorRun }>(`${BASE}/runs/${id}/replay`, { method: "POST" })

export const replaySku = (vendor_code: string, partNumber: string) =>
  jsonFetch<{ message: string }>(
    `${BASE}/skus/${encodeURIComponent(partNumber)}/replay`,
    { method: "POST", body: JSON.stringify({ vendor_code }) }
  )
```

- [ ] **Step 2: Write the run-detail drawer**

```tsx
// backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx
import { useState } from "react"
import { Drawer, Badge, Button, Input, Label, Text, toast } from "@medusajs/ui"
import { badgeForStatus } from "./status-actions"
import { replaySku, type VendorRun } from "./api"

type Props = {
  run: VendorRun | null
  onClose: () => void
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <Text size="small" weight="plus">{value}</Text>
  </div>
)

const RunDetailDrawer = ({ run, onClose }: Props) => {
  const [partNumber, setPartNumber] = useState("")
  const [busy, setBusy] = useState(false)

  const onReplaySku = async () => {
    if (!run || !partNumber.trim()) return
    setBusy(true)
    try {
      await replaySku(run.vendor_code, partNumber.trim())
      toast.success(`Replayed ${partNumber.trim()}`)
      setPartNumber("")
    } catch (e: any) {
      toast.error(e?.message ?? "Replay failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={!!run} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{run?.vendor_code}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4 overflow-y-auto">
          {run && (
            <>
              <div className="flex items-center gap-2">
                <Badge color={badgeForStatus(run.status)}>{run.status}</Badge>
                <Text size="small" className="text-ui-fg-subtle">{run.source_filename}</Text>
              </div>
              <div>
                <Stat label="Rows" value={run.row_count} />
                <Stat label="New" value={run.new_count} />
                <Stat label="Changed" value={run.changed_count} />
                <Stat label="Discontinued" value={run.discontinued_count} />
                <Stat label="Hash-matched (skipped)" value={run.hash_match_count} />
                <Stat label="No-image (skipped)" value={run.skipped_no_image_count} />
                <Stat label="Apply attempts" value={run.apply_attempt_count} />
              </div>
              {run.error_message && (
                <Text size="small" className="text-ui-fg-error">{run.error_message}</Text>
              )}
              {!!run.failed_group_keys?.length && (
                <div>
                  <Text size="small" weight="plus">Failed groups ({run.failed_group_keys.length})</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle break-all">
                    {run.failed_group_keys.join(", ")}
                  </Text>
                </div>
              )}
              <div className="border-t pt-4">
                <Label size="small">Replay a single SKU</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="part number"
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                  />
                  <Button variant="secondary" disabled={busy || !partNumber.trim()} onClick={onReplaySku}>
                    Replay
                  </Button>
                </div>
              </div>
            </>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

export default RunDetailDrawer
```

- [ ] **Step 3: Write the route page**

```tsx
// backend/src/admin/routes/vendor-sync/page.tsx
import { useEffect, useState, useCallback } from "react"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import {
  Container, Heading, Table, Badge, Button, Select, Prompt, toast, Text,
} from "@medusajs/ui"
import {
  actionsForStatus, badgeForStatus, isNonTerminal, type RunAction,
} from "./status-actions"
import {
  listRuns, triggerRun, approveRun, cancelRun, replayRun,
  VENDOR_CODES, type VendorRun,
} from "./api"
import RunDetailDrawer from "./run-detail-drawer"

const ACTION_LABEL: Record<RunAction, string> = {
  approve: "Approve",
  cancel: "Cancel",
  replay: "Replay",
}

const runAction = (a: RunAction, id: string) =>
  a === "approve" ? approveRun(id) : a === "cancel" ? cancelRun(id) : replayRun(id)

type Confirm = { title: string; description: string; run: () => Promise<void> } | null

const VendorSyncPage = () => {
  const [runs, setRuns] = useState<VendorRun[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [triggerVendor, setTriggerVendor] = useState<string>(VENDOR_CODES[0])
  const [detail, setDetail] = useState<VendorRun | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  const load = useCallback(async () => {
    try {
      const { runs } = await listRuns({ status: statusFilter || undefined, limit: 25 })
      setRuns(runs)
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load runs")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { setLoading(true); load() }, [load])

  // Poll while any visible run is still moving on its own.
  useEffect(() => {
    if (!runs.some((r) => isNonTerminal(r.status))) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [runs, load])

  const onTrigger = async () => {
    try {
      await triggerRun(triggerVendor, true)
      toast.success(`Dry-run started for ${triggerVendor}`)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Trigger failed")
    }
  }

  const doAction = (a: RunAction, run: VendorRun) => {
    const run_ = async () => {
      try {
        await runAction(a, run.id)
        toast.success(`${ACTION_LABEL[a]} ok`)
        setConfirm(null)
        load()
      } catch (e: any) {
        toast.error(e?.message ?? `${ACTION_LABEL[a]} failed`)
      }
    }
    setConfirm({
      title: `${ACTION_LABEL[a]} run?`,
      description:
        a === "approve"
          ? "This applies the staged diff to the live catalog. It can take minutes."
          : a === "cancel"
          ? "This cooperatively cancels the run."
          : "This re-runs the feed from staging.",
      run: run_,
    })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Vendor Sync</Heading>
        <div className="flex items-center gap-2">
          <Select value={triggerVendor} onValueChange={setTriggerVendor}>
            <Select.Trigger className="w-[200px]"><Select.Value /></Select.Trigger>
            <Select.Content>
              {VENDOR_CODES.map((v) => (
                <Select.Item key={v} value={v}>{v}</Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Button onClick={onTrigger}>Run dry-run</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">Status</Text>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <Select.Trigger className="w-[200px]"><Select.Value placeholder="All" /></Select.Trigger>
          <Select.Content>
            <Select.Item value="">All</Select.Item>
            {["awaiting_approval", "applying", "completed", "failed", "partially_failed", "cancelled", "exhausted"].map((s) => (
              <Select.Item key={s} value={s}>{s}</Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Vendor</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Started</Table.HeaderCell>
            <Table.HeaderCell>New / Chg / Disc</Table.HeaderCell>
            <Table.HeaderCell>Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {runs.map((r) => (
            <Table.Row key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
              <Table.Cell>{r.vendor_code}</Table.Cell>
              <Table.Cell><Badge color={badgeForStatus(r.status)}>{r.status}</Badge></Table.Cell>
              <Table.Cell>{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</Table.Cell>
              <Table.Cell>{r.new_count} / {r.changed_count} / {r.discontinued_count}</Table.Cell>
              <Table.Cell onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2">
                  {actionsForStatus(r.status).map((a) => (
                    <Button key={a} size="small" variant={a === "cancel" ? "secondary" : "primary"}
                      onClick={() => doAction(a, r)}>
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
          {!loading && runs.length === 0 && (
            <Table.Row><Table.Cell colSpan={5}>No runs.</Table.Cell></Table.Row>
          )}
        </Table.Body>
      </Table>

      <RunDetailDrawer run={detail} onClose={() => setDetail(null)} />

      <Prompt open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{confirm?.title}</Prompt.Title>
            <Prompt.Description>{confirm?.description}</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={() => confirm?.run()}>Confirm</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Sync",
  icon: ArrowPath,
})

export default VendorSyncPage
```

- [ ] **Step 4: Build the admin to verify it compiles**

Run: `cd backend && npx medusa build`
Expected: build completes (admin bundle compiles). If an import is wrong (e.g. an `@medusajs/ui` export name or `@medusajs/icons` icon that doesn't exist), the build fails with a clear module/export error — fix the import and rebuild. Confirm there are no references to undefined `@medusajs/ui` components (`Container`, `Heading`, `Table`, `Badge`, `Button`, `Select`, `Prompt`, `Drawer`, `Input`, `Label`, `Text`, `toast` are all real v2 exports).

- [ ] **Step 5: Re-run the admin helper test (guard against drift)**

Run: `cd backend && npx jest src/admin`
Expected: PASS (status-actions still green; the new files don't break it).

- [ ] **Step 6: Commit**

```bash
git add backend/src/admin/routes/vendor-sync/api.ts \
  backend/src/admin/routes/vendor-sync/run-detail-drawer.tsx \
  backend/src/admin/routes/vendor-sync/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): vendor-sync operator console route (WB-006)

A sidebar admin route over the existing /admin/vendor-sync/* routes: run list
(status filter), trigger dry-run, status-gated approve/cancel/replay with confirm
prompts, polling while runs are in flight, and a detail drawer with counts/errors
+ replay-SKU. purge-products is deliberately excluded (cutover tool, not routine).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage:**
- WB-006 (admin console, full route + actions) → Tasks 5 + 6. ✓ (purge excluded per spec)
- WB-021 (cache Meili, unstable_cache 60s, `discoveryCacheKey`) → Task 4. ✓
- WB-046 (remove dead category facet, incl. `DiscoveryProduct.categories`/`EMPTY_FILTERS`/`parseQueryFromSearchParams`) → Task 3. ✓
- WB-044 (rename teraflex → Petrol, whole suite) → Task 2. ✓
- WB-052 (shared `truncateVendorState`, dev-wipe + truncate-state delegate) → Task 1. ✓

**Type consistency:** `discoveryCacheKey(query: DiscoveryQuery)` used identically in Task 4. `actionsForStatus`/`badgeForStatus`/`isNonTerminal` defined in Task 5, consumed with matching signatures in Task 6. `VendorRun` shape in `api.ts` matches the `vendor_feed_run` model fields. `RunAction` union consistent across files.

**Placeholder scan:** no TBD/TODO/"add error handling" — every step has concrete code or an exact command + expected output.

**Sequencing note:** Task 3 (remove categories) precedes Task 4 (cache) so the cache wrapper is written against the cleaned `get-products.ts`/`DiscoveryFilters`. Tasks 1, 2, 5, 6 are independent. Task 6 depends on Task 5 (helpers).
