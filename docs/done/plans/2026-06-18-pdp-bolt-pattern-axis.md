# WB-003 · Bolt pattern gates the PDP variant grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDP variant grid bolt-pattern-aware so the same size in two patterns no longer collapses into one cell, and Add-to-Cart always sends the variant for the selected (pattern, size, offset).

**Architecture:** Extract the variant→size grouping out of the PDP loader into a pure, unit-testable module that keys size groups on `Diameter × Width × BoltPattern` (so each `SizeOption` is scoped to one pattern). The hero filters the size grid by the selected bolt pattern and re-snaps the selected size when the pattern changes. No backend or Meilisearch change — variants already carry `bolt_pattern_raw`.

**Tech Stack:** Next.js 15 / React 19 storefront, TypeScript, Vitest (pure-unit only — no RTL/jsdom), Medusa Store API.

**Spec:** [docs/in-progress/specs/2026-06-18-pdp-bolt-pattern-axis-design.md](../specs/2026-06-18-pdp-bolt-pattern-axis-design.md)

## Global Constraints

- Run all storefront commands from `storefront/`.
- Storefront tests are Vitest pure units only (no React Testing Library / jsdom). Do NOT add a component-test harness. Run with `npx vitest run <path>`.
- `next.config.js` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` — type/lint errors do NOT fail the build; check with `npx tsc --noEmit` separately. Pre-existing tsc errors live in `lib/data/*` and a few `modules/*` files (Medusa SDK drift) — do not try to fix them.
- Path aliases: `@modules/*`, `@lib/*`, `@/*` (see tsconfig). Use them as the surrounding files do.
- Naming: no `wb-`/`WB` prefix on identifiers (project name is implied).
- Commit trailer required on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- No backend or Meilisearch changes in this plan.

---

### Task 1: Pattern-scoped grouping — extract `group-sizes.ts` + `SizeOption.boltPattern`

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts` (add `boltPattern` to `SizeOption`)
- Create: `storefront/src/modules/product-detail/data/group-sizes.ts`
- Create: `storefront/src/modules/product-detail/data/group-sizes.test.ts`
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (use the extracted grouping; drop the inline `num`/`availabilityOf`/`toSizeOptions`)

**Interfaces:**
- Produces (consumed by Task 2 and `get-product.ts`):
  - `num(v: unknown): number` — finite-or-0 coercion.
  - `groupVariantsIntoSizes(variants: HttpTypes.StoreProductVariant[], productWeightLb: number): SizeOption[]` — groups by `Diameter × Width × BoltPattern`; each `SizeOption` carries `boltPattern` and only that pattern's offsets.
  - `sizesForBoltPattern(sizes: SizeOption[], pattern: string): SizeOption[]` — the pattern's sizes, or ALL sizes when none match (fallback).
  - `pickDefaultSize(sizes: SizeOption[]): SizeOption` — first in-stock, else first.
- `SizeOption` gains `boltPattern: string`.

- [ ] **Step 1: Add `boltPattern` to `SizeOption`**

In `storefront/src/modules/product-detail/data/types.ts`, inside the `SizeOption` type, add the field right after the `offsetMm` line:

```ts
  /** Raw bolt pattern (e.g. "5x114.3") this size is scoped to. Each SizeOption belongs to exactly one pattern; the picker filters sizes by the selected pattern. */
  boltPattern: string
```

- [ ] **Step 2: Write the failing tests for the pure grouping module**

Create `storefront/src/modules/product-detail/data/group-sizes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
} from "./group-sizes"

// Minimal variant factory mirroring the Medusa Store API shape the loader reads.
function variant(
  id: string,
  diameter: number,
  width: number,
  offset: number,
  bolt: string,
  qty: number,
  priceMajor: number
) {
  return {
    id,
    metadata: {
      wheel_diameter_in: diameter,
      wheel_width_in: width,
      offset_mm: offset,
      bolt_pattern_raw: bolt,
    },
    inventory_quantity: qty,
    calculated_price: { calculated_amount: priceMajor },
  } as any
}

describe("groupVariantsIntoSizes — bolt-pattern scoping", () => {
  it("keeps the same Diameter×Width in two patterns as TWO size options", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 9, 35, "6x139.7", 10, 400),
      ],
      28
    )
    expect(sizes).toHaveLength(2)
    const fivelug = sizes.find((s) => s.boltPattern === "5x114.3")!
    const sixlug = sizes.find((s) => s.boltPattern === "6x139.7")!
    expect(fivelug.offsetVariants?.map((o) => o.variantId)).toEqual(["v_a"])
    expect(sixlug.offsetVariants?.map((o) => o.variantId)).toEqual(["v_b"])
    expect(fivelug.priceCentsOverride).toBe(30000)
    expect(sixlug.priceCentsOverride).toBe(40000)
  })

  it("accumulates sibling offsets WITHIN a pattern, not across patterns", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 9, 35, "5x114.3", 2, 320),
        variant("v_c", 20, 9, 40, "6x139.7", 10, 400),
      ],
      28
    )
    const fivelug = sizes.find((s) => s.boltPattern === "5x114.3")!
    expect(fivelug.offsetVariants).toHaveLength(2)
    // best-availability across the 5x114.3 siblings (in_stock beats low_stock)
    expect(fivelug.availability).toBe("in_stock")
    // min non-zero price within the pattern
    expect(fivelug.priceCentsOverride).toBe(30000)
  })

  it("treats a single-pattern product exactly as one size per distinct D×W", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
        variant("v_b", 20, 10, 20, "5x114.3", 10, 320),
      ],
      28
    )
    expect(sizes).toHaveLength(2)
    expect(sizes.every((s) => s.boltPattern === "5x114.3")).toBe(true)
  })
})

describe("sizesForBoltPattern", () => {
  const base = groupVariantsIntoSizes(
    [
      variant("v_a", 20, 9, 18, "5x114.3", 10, 300),
      variant("v_b", 20, 9, 35, "6x139.7", 10, 400),
    ],
    28
  )
  it("returns only the matching pattern's sizes", () => {
    const r = sizesForBoltPattern(base, "6x139.7")
    expect(r).toHaveLength(1)
    expect(r[0].boltPattern).toBe("6x139.7")
  })
  it("falls back to ALL sizes when the pattern is absent/unknown", () => {
    expect(sizesForBoltPattern(base, "8x180")).toHaveLength(2)
  })
})

describe("pickDefaultSize", () => {
  it("returns the first in-stock size", () => {
    const sizes = groupVariantsIntoSizes(
      [
        variant("v_oos", 20, 9, 18, "5x114.3", 0, 300),
        variant("v_ok", 20, 10, 20, "5x114.3", 10, 320),
      ],
      28
    )
    expect(pickDefaultSize(sizes).diameter).toBe(20)
    expect(pickDefaultSize(sizes).width).toBe(10)
  })
  it("falls back to the first when all are out of stock", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_oos", 20, 9, 18, "5x114.3", 0, 300)],
      28
    )
    expect(pickDefaultSize(sizes).width).toBe(9)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/modules/product-detail/data/group-sizes.test.ts`
Expected: FAIL — cannot resolve `./group-sizes` (module not created yet).

- [ ] **Step 4: Implement the pure grouping module**

Create `storefront/src/modules/product-detail/data/group-sizes.ts`:

```ts
import { HttpTypes } from "@medusajs/types"
import { OffsetVariant, SizeOption } from "./types"

/** Coerce an unknown to a finite number, else 0. Shared by the PDP loader. */
export const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0

function availabilityOf(qty: number): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= 4) return "low_stock"
  return "in_stock"
}

const rank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const

/**
 * Group variants into the Diameter × Width × BoltPattern size matrix. The
 * group key includes `bolt_pattern_raw`, so each SizeOption is scoped to ONE
 * bolt pattern and its offsets / price / availability never mix across
 * patterns. `productWeightLb` is the single product-level weight (vendor data
 * has no per-size weight) applied to every size.
 */
export function groupVariantsIntoSizes(
  variants: HttpTypes.StoreProductVariant[],
  productWeightLb: number
): SizeOption[] {
  const byKey = new Map<string, SizeOption>()
  for (const v of variants) {
    const m = (v.metadata ?? {}) as Record<string, unknown>
    const diameter = num(m.wheel_diameter_in)
    const width = num(m.wheel_width_in)
    const offsetMm = num(m.offset_mm)
    const boltPattern = String(m.bolt_pattern_raw ?? "")
    const key = `${diameter}x${width}|${boltPattern}`
    const qty = num((v as any).inventory_quantity)
    const priceCents = Math.round(
      num((v.calculated_price as any)?.calculated_amount) * 100
    )
    const avail = availabilityOf(qty)
    const offset: OffsetVariant = {
      value: offsetMm,
      backspaceIn: "",
      priceCents: priceCents > 0 ? priceCents : undefined,
      variantId: v.id,
      availability: avail,
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.offsetVariants = [...(existing.offsetVariants ?? []), offset]
      // Best availability across sibling offsets within this pattern.
      if (rank[avail] > rank[existing.availability]) existing.availability = avail
      // Min non-zero price across sibling offsets for the size "from" price.
      if (priceCents > 0) {
        existing.priceCentsOverride =
          existing.priceCentsOverride && existing.priceCentsOverride > 0
            ? Math.min(existing.priceCentsOverride, priceCents)
            : priceCents
      }
    } else {
      byKey.set(key, {
        diameter,
        width,
        offsetMm,
        oemOffsetMm: offsetMm,
        boltPattern,
        offsetVariants: [offset],
        weightLb: productWeightLb,
        availability: avail,
        priceCentsOverride: priceCents > 0 ? priceCents : undefined,
      })
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.diameter - b.diameter || a.width - b.width
  )
}

/**
 * The sizes available for a given bolt pattern. Falls back to ALL sizes when
 * no size matches (a product with no/unknown bolt pattern), so single-pattern
 * and pattern-less products behave exactly as before.
 */
export function sizesForBoltPattern(
  sizes: SizeOption[],
  pattern: string
): SizeOption[] {
  const matching = sizes.filter((s) => s.boltPattern === pattern)
  return matching.length > 0 ? matching : sizes
}

/** Default size pick: first in-stock, else the first. */
export function pickDefaultSize(sizes: SizeOption[]): SizeOption {
  return sizes.find((s) => s.availability !== "out_of_stock") ?? sizes[0]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/modules/product-detail/data/group-sizes.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 6: Rewire `get-product.ts` to use the extracted module**

In `storefront/src/modules/product-detail/data/get-product.ts`:

1. Add to the imports near the top (after the existing `import { ProductDetail, SizeOption } from "./types"`):

```ts
import { num, groupVariantsIntoSizes } from "./group-sizes"
```

2. DELETE the local `num` definition (the `const num = (v: unknown): number => ...` near the top).
3. DELETE the local `availabilityOf` function.
4. DELETE the entire local `toSizeOptions` function.
5. In `mapToDetail`, change the `sizeOptions` line from `sizeOptions: toSizeOptions(variants, weightLb),` to:

```ts
    sizeOptions: groupVariantsIntoSizes(variants, weightLb),
```

(`SizeOption` is still imported from `./types` and used by other code in the file; leave that import.)

- [ ] **Step 7: Typecheck the touched data files**

Run: `npx tsc --noEmit 2>&1 | grep -E "product-detail/data/(group-sizes|get-product|types)" || echo "no new errors in touched data files"`
Expected: `no new errors in touched data files` (pre-existing unrelated errors elsewhere are fine).

- [ ] **Step 8: Run the PDP data suite (new + existing resolver tests)**

Run: `npx vitest run src/modules/product-detail/data`
Expected: PASS — `group-sizes.test.ts` + the existing `resolve-variant.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add storefront/src/modules/product-detail/data/types.ts storefront/src/modules/product-detail/data/group-sizes.ts storefront/src/modules/product-detail/data/group-sizes.test.ts storefront/src/modules/product-detail/data/get-product.ts
git commit -m "feat(pdp): bolt-pattern-scoped size grouping in a pure group-sizes module (WB-003)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Hero filters the size grid by the selected bolt pattern

**Files:**
- Modify: `storefront/src/modules/product-detail/components/hero/index.tsx`

**Interfaces:**
- Consumes: `sizesForBoltPattern`, `pickDefaultSize` from `../../data/group-sizes` (Task 1).
- Produces: PDP behavior — the size grid shows only the selected pattern's sizes; changing the pattern reflows the grid and re-snaps the selected size; the cart variant resolves by (pattern, size, offset). No new exports. Verified by tsc + the Task 3 live check (client component; the repo has no RTL harness).

- [ ] **Step 1: Add the imports**

In `storefront/src/modules/product-detail/components/hero/index.tsx`, add to the existing import from the data module group (near the `resolveSelectedVariant` import):

```ts
import { sizesForBoltPattern, pickDefaultSize } from "../../data/group-sizes"
```

- [ ] **Step 2: Reorder state so the pattern drives the visible sizes**

Replace the current block (the `defaultSize` useMemo, the `selectedSize` state, and the `selectedBoltPattern` state — currently in that order) with this order, so `selectedBoltPattern` is declared first and the visible sizes derive from it:

```ts
  const [selectedBoltPattern, setSelectedBoltPattern] = useState<string>(
    product.boltPatternOptions[0] ?? product.boltPattern
  )

  // Bolt pattern gates the grid: only the selected pattern's sizes are shown.
  const visibleSizes = useMemo<SizeOption[]>(
    () => sizesForBoltPattern(product.sizeOptions, selectedBoltPattern),
    [product.sizeOptions, selectedBoltPattern]
  )

  // Default to the first in-stock size in the visible (pattern-scoped) set.
  const defaultSize = useMemo<SizeOption>(
    () => pickDefaultSize(visibleSizes),
    [visibleSizes]
  )
  const [selectedSize, setSelectedSize] = useState<SizeOption>(defaultSize)

  // When the bolt pattern changes, the previously-selected size belongs to the
  // old pattern and is no longer in visibleSizes — re-snap to a valid size.
  // visibleSizes is filtered from product.sizeOptions, so element references are
  // preserved and includes() is a reliable membership check.
  useEffect(() => {
    if (!visibleSizes.includes(selectedSize)) {
      setSelectedSize(pickDefaultSize(visibleSizes))
    }
    // selectedSize intentionally omitted: re-snap only when the pattern changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSizes])
```

(The existing `useEffect`/`useMemo`/`useState` imports already cover these. The offset state block — `offsetVariants`, `oemOffsetMm`, `selectedOffsetMm`, and the offset-snap effect — stays exactly as is, immediately below.)

- [ ] **Step 3: Pass the visible sizes to the picker**

In the JSX, change the `VariantPicker`'s `sizes` prop from `sizes={product.sizeOptions}` to:

```tsx
          sizes={visibleSizes}
```

(Leave `boltPatterns={product.boltPatternOptions}`, `selectedBoltPattern`, and `onBoltPatternChange={setSelectedBoltPattern}` unchanged — the row is now load-bearing.)

- [ ] **Step 4: Typecheck the hero**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/hero/index" || echo "no new errors in hero"`
Expected: `no new errors in hero`.

- [ ] **Step 5: Run the PDP suite to confirm nothing regressed**

Run: `npx vitest run src/modules/product-detail`
Expected: PASS (data-layer tests unchanged; no test imports the client hero).

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/product-detail/components/hero/index.tsx
git commit -m "fix(pdp): bolt-pattern row filters the size grid + re-snaps the size (WB-003)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Live verification against a real multi-pattern product + close-out

**Files:**
- Create (temporary, not committed): `storefront/scratch-wb003-verify.mjs`
- Modify: `docs/future/BACKLOG.md` (WB-003 → done)
- Modify: `docs/STATUS.md` (PDP pillar row + Active work + Last verified + Storefront test count)
- Move: `docs/in-progress/specs/2026-06-18-pdp-bolt-pattern-axis-design.md` → `docs/done/specs/`
- Move: `docs/in-progress/plans/2026-06-18-pdp-bolt-pattern-axis.md` → `docs/done/plans/`

**Interfaces:**
- Consumes: a running backend on `:9000` with a seeded catalog + publishable key; `groupVariantsIntoSizes`/`sizesForBoltPattern` from Task 1.
- Produces: a documented green verification (a real product with ≥2 bolt patterns groups into per-pattern size sets) + synced docs. Terminal deliverable for WB-003.

- [ ] **Step 1: Ensure a backend is running with a publishable key**

The backend must be up on `:9000` (the controller starts it). Read the publishable key from `storefront/.env.local` (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...`) and export it as `PUBKEY` for Step 2.

- [ ] **Step 2: Write the verification script**

Create `storefront/scratch-wb003-verify.mjs` (scratch — deleted in Step 5, never committed). It pulls products from the Store API, finds one whose variants span ≥2 `bolt_pattern_raw` values, and replays the pattern-scoped grouping to assert the fix:

```js
// WB-003 verify: a real product with >=2 bolt patterns groups into per-pattern
// size sets (no same-size cross-pattern collapse). Run: node scratch-wb003-verify.mjs
const BASE = "http://localhost:9000"
const PUBKEY = process.env.PUBKEY
if (!PUBKEY) throw new Error("set PUBKEY env to a publishable API key")
const H = { "x-publishable-api-key": PUBKEY }
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

// Replicate the Task-1 grouping (kept in sync with group-sizes.ts) for a live check.
function groupVariantsIntoSizes(variants) {
  const byKey = new Map()
  for (const v of variants) {
    const m = v.metadata ?? {}
    const key = `${num(m.wheel_diameter_in)}x${num(m.wheel_width_in)}|${String(m.bolt_pattern_raw ?? "")}`
    if (!byKey.has(key)) byKey.set(key, { boltPattern: String(m.bolt_pattern_raw ?? ""), diameter: num(m.wheel_diameter_in), width: num(m.wheel_width_in), variantIds: [] })
    byKey.get(key).variantIds.push(v.id)
  }
  return [...byKey.values()]
}

// Page through products; pick the first with >=2 distinct bolt patterns across variants.
let region = await (await fetch(`${BASE}/store/regions`, { headers: H })).json()
const regionId = region.regions?.[0]?.id
let found = null
for (let offset = 0; offset < 400 && !found; offset += 100) {
  const url = `${BASE}/store/products?limit=100&offset=${offset}&region_id=${regionId}&fields=handle,*variants,*variants.metadata`
  const { products = [] } = await (await fetch(url, { headers: H })).json()
  if (!products.length) break
  for (const p of products) {
    const patterns = new Set((p.variants ?? []).map((v) => String(v.metadata?.bolt_pattern_raw ?? "")).filter(Boolean))
    if (patterns.size >= 2) { found = p; break }
  }
}
if (!found) { console.log("NO multi-pattern product in catalog — rely on unit tests (synthetic regression case)"); process.exit(0) }

const sizes = groupVariantsIntoSizes(found.variants)
const patterns = [...new Set(sizes.map((s) => s.boltPattern).filter(Boolean))]
// Assert: at least one Diameter×Width exists under >1 pattern (the collapse case),
// and each (size,pattern) group is its own SizeOption.
const dwToPatterns = new Map()
for (const s of sizes) {
  const dw = `${s.diameter}x${s.width}`
  if (!dwToPatterns.has(dw)) dwToPatterns.set(dw, new Set())
  dwToPatterns.get(dw).add(s.boltPattern)
}
const collapsed = [...dwToPatterns.entries()].filter(([, ps]) => ps.size >= 2)
console.log("handle:", found.handle)
console.log("distinct patterns:", patterns)
console.log("size groups:", sizes.length, "| D×W with >1 pattern:", collapsed.map(([dw]) => dw))
console.log(collapsed.length > 0
  ? `PASS: ${collapsed.length} D×W now split per-pattern (would have collapsed before the fix)`
  : "PARTIAL: product has 2 patterns but no shared D×W; per-pattern grouping still verified by unit tests")
```

- [ ] **Step 3: Run the verification**

Run: `cd storefront && PUBKEY=<key> node scratch-wb003-verify.mjs`
Expected: prints a real `handle`, ≥2 `distinct patterns`, and either `PASS: …` (a shared D×W split per pattern) or the `PARTIAL`/`NO multi-pattern` note. Record the exact output in the report. (If `NO multi-pattern`, the synthetic unit tests from Task 1 remain the authoritative proof of the regression case — note this explicitly.)

- [ ] **Step 4: Close out the backlog + STATUS**

In `docs/future/BACKLOG.md`, set WB-003 `status: done` and append a `- done:` line:
```
- done: SizeOption is now bolt-pattern-scoped (group key gains bolt_pattern_raw) via pure group-sizes.ts; the bolt-pattern row filters the size grid and the cart resolves by (pattern, size, offset). Verified by group-sizes unit tests (same-size-two-patterns → two SizeOptions) + a live Store-API check on a real multi-pattern product.
```

In `docs/STATUS.md`:
- Bump `> **Last verified: 2026-06-18.**` (keep today's date).
- PDP pillar row: change the one-liner `… grid collapses bolt patterns; fitment=[].` → `… bolt-pattern row gates the grid (WB-003 done); fitment=[].` and remove `WB-003` from that row's Open backlog cell.
- Active work block: replace with `None in progress. **WB-003** (PDP bolt-pattern axis) shipped to \`main\`. Next up: **WB-009** (PDP reverse-fitment) or **WB-004** (home featured/gallery content).`
- Storefront test line: run `npx vitest run` (whole suite) and set the count to the exact observed number of passing tests (Task 1 adds ~8). Do NOT guess — use the number the run prints.

- [ ] **Step 5: Delete the scratch file and move the docs**

```bash
rm storefront/scratch-wb003-verify.mjs
git mv docs/in-progress/specs/2026-06-18-pdp-bolt-pattern-axis-design.md docs/done/specs/
git mv docs/in-progress/plans/2026-06-18-pdp-bolt-pattern-axis.md docs/done/plans/
```

- [ ] **Step 6: Commit the close-out**

```bash
git add docs/
git commit -m "docs: close WB-003 (PDP bolt-pattern axis) — backlog, STATUS, move spec+plan to done

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `SizeOption.boltPattern` + group key includes `bolt_pattern_raw` → Task 1 Steps 1, 4. ✓
- Grouping extracted to pure `group-sizes.ts`; `get-product.ts` rewired → Task 1 Steps 4, 6. ✓
- `sizesForBoltPattern` (with all-sizes fallback) + `pickDefaultSize` → Task 1 Step 4, tested Step 2. ✓
- Hero filters by selected pattern + re-snaps selected size; cart resolves by (pattern, size, offset) → Task 2. ✓
- `OffsetVariant` unchanged; VariantPicker structurally unchanged → no task modifies them. ✓
- Single/no-pattern no-regression → fallback in `sizesForBoltPattern` + test (Task 1 Step 2 "single-pattern" + "fallback"). ✓
- Testing: regression case, single-pattern, within-pattern best-availability/min-price, filter, default → Task 1 Step 2; `resolve-variant.test.ts` stays green → Task 1 Step 8. ✓
- Live verification on a real multi-pattern product → Task 3. ✓
- Out of scope (garage auto-select, backend/index changes, Approach B) → no task touches them. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content. ✓

**Type consistency:** `groupVariantsIntoSizes(variants, productWeightLb): SizeOption[]`, `sizesForBoltPattern(sizes, pattern): SizeOption[]`, `pickDefaultSize(sizes): SizeOption`, `num(v): number`, and `SizeOption.boltPattern: string` are used identically in Tasks 1–2. The hero uses `visibleSizes.includes(selectedSize)` on references preserved by `Array.prototype.filter`. ✓
