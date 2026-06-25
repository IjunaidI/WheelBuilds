# PDP correctness & polish (G3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the live PDP "BLANK" bolt-pattern defect (WB-048), de-hardcode PDP placeholders to a config module + hide empty specs (WB-029), and de-drift the `normalizeFinish` twin via a shared golden fixture (WB-030).

**Architecture:** All logic lives in pure, unit-testable helpers in the storefront PDP data layer; React components are thin consumers. WB-030 adds a repo-root golden fixture consumed by one test in each app (the existing bolt-pattern precedent). No database writes, no migration, no catalog re-apply, no new dependency.

**Tech Stack:** Next.js 15 / React 19 storefront (Vitest), MedusaJS 2.13.6 backend (Jest). TypeScript throughout.

Spec: [docs/in-progress/specs/2026-06-25-pdp-correctness-polish-design.md](../specs/2026-06-25-pdp-correctness-polish-design.md)

## Global Constraints

- **No `wb-`/`WB`/`wheelbuilds-` prefix** on any identifier, file, export, or CSS class (project name is implied).
- **Storefront tests:** `cd storefront && pnpm test:unit` (= `vitest run`). **Backend tests:** `cd backend && pnpm test:sync` (= jest).
- **Path aliases (storefront):** `@lib/*` → `src/lib/*`, `@modules/*` → `src/modules/*`. `@/*` is reserved for shadcn — don't use it for PDP code.
- **Golden fixtures live at repo root `fixtures/`** and are read from tests via the 5-level relative path `../../../../../fixtures/<name>.json` (from both `backend/src/modules/vendor-sync/__tests__/` and `storefront/src/lib/fitment/__tests__/`).
- **`Finish` type** is `"black" | "bronze" | "silver"`, imported from `@modules/common/components/wheel` (storefront) / defined locally (backend `normalize-finish.ts`).
- **Don't reformat or "fix" unrelated pre-existing TS/eslint errors** (the storefront build ignores them by design).
- Frequent commits — one per task. End each commit message with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: WB-030 — shared finish golden fixture + backend golden test

The backend `normalizeFinish` already exists and is correct; this task codifies its behavior in a shared golden the storefront copy must also satisfy (Task 2).

**Files:**
- Create: `fixtures/finish-normalize-golden.json`
- Create: `backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts`
- Modify: `backend/src/modules/vendor-sync/search/normalize-finish.ts` (comment only)

**Interfaces:**
- Consumes: `normalizeFinish(raw: string | null | undefined): "black"|"bronze"|"silver"` from `../search/normalize-finish` (existing).
- Produces: `fixtures/finish-normalize-golden.json` — `{ input: string, output: "black"|"bronze"|"silver" }[]` — consumed by Task 2's storefront test.

- [ ] **Step 1: Create the shared golden fixture**

Create `fixtures/finish-normalize-golden.json`:

```json
[
  { "input": "Bronze",               "output": "bronze" },
  { "input": "Satin Gold",           "output": "bronze" },
  { "input": "Copper",               "output": "bronze" },
  { "input": "Brushed Brass",        "output": "bronze" },
  { "input": "BRONZE",               "output": "bronze" },
  { "input": "Gloss Black Machined", "output": "black" },
  { "input": "Gloss Black Milled",   "output": "black" },
  { "input": "Matte Black",          "output": "black" },
  { "input": "BLACK",                "output": "black" },
  { "input": "Machined",             "output": "silver" },
  { "input": "Gunmetal",             "output": "silver" },
  { "input": "Titanium",             "output": "silver" },
  { "input": "Graphite",             "output": "silver" },
  { "input": "Polished",             "output": "silver" },
  { "input": "Chrome",               "output": "silver" },
  { "input": "Gray",                 "output": "silver" },
  { "input": "Grey",                 "output": "silver" },
  { "input": "",                     "output": "black" },
  { "input": "Brushed Olive",        "output": "black" }
]
```

- [ ] **Step 2: Write the backend golden test**

Create `backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeFinish } from "../search/normalize-finish"

// from backend/src/modules/vendor-sync/__tests__/ up to repo root:
// __tests__ → vendor-sync → modules → src → backend → root = 5
const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/finish-normalize-golden.json"), "utf8")
) as { input: string; output: "black" | "bronze" | "silver" }[]

describe("normalizeFinish matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${output}`, () => {
      expect(normalizeFinish(input)).toBe(output)
    })
  }
})
```

- [ ] **Step 3: Run the backend golden test (expect PASS — it codifies current behavior)**

Run: `cd backend && pnpm test:sync -- normalize-finish-golden`
Expected: PASS, all golden vectors green. If any vector FAILS, the golden value is wrong for the current rule — fix the fixture entry, not the function (the backend function is the canonical source).

- [ ] **Step 4: Update the backend comment to name the golden as the contract**

In `backend/src/modules/vendor-sync/search/normalize-finish.ts`, replace the trailing `NOTE:` paragraph (the "byte-equivalent copy ... keep the two in lockstep" note, ~lines 17-19) with:

```ts
 * LOCKSTEP: the storefront PDP carries a twin
 * (storefront/src/lib/fitment/normalize-finish.ts). Both are guarded against drift
 * by fixtures/finish-normalize-golden.json — a test in EACH app asserts its copy
 * matches the shared vectors (see __tests__/normalize-finish-golden.test.ts here and
 * lib/fitment/__tests__/normalize-finish.test.ts in the storefront). Update the golden
 * and both copies together.
```

- [ ] **Step 5: Run the full vendor-sync suite to confirm no regression**

Run: `cd backend && pnpm test:sync`
Expected: PASS (existing suite + the new golden test).

- [ ] **Step 6: Commit**

```bash
git add fixtures/finish-normalize-golden.json backend/src/modules/vendor-sync/__tests__/normalize-finish-golden.test.ts backend/src/modules/vendor-sync/search/normalize-finish.ts
git commit -m "test(finish): shared golden fixture + backend lockstep test (WB-030)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: WB-030 — extract storefront normalizeFinish + storefront golden test

**Files:**
- Create: `storefront/src/lib/fitment/normalize-finish.ts`
- Create: `storefront/src/lib/fitment/__tests__/normalize-finish.test.ts`
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (remove inline fn, import the extracted one)

**Interfaces:**
- Consumes: `fixtures/finish-normalize-golden.json` (Task 1); `Finish` from `@modules/common/components/wheel`.
- Produces: `normalizeFinish(raw: unknown): Finish` exported from `@lib/fitment/normalize-finish` — used by `get-product.ts`.

- [ ] **Step 1: Write the failing storefront test**

Create `storefront/src/lib/fitment/__tests__/normalize-finish.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeFinish } from "../normalize-finish"

const golden = JSON.parse(
  readFileSync(join(__dirname, "../../../../../fixtures/finish-normalize-golden.json"), "utf8")
) as { input: string; output: "black" | "bronze" | "silver" }[]

describe("normalizeFinish twin matches the shared golden vectors", () => {
  for (const { input, output } of golden) {
    it(`${JSON.stringify(input)} -> ${output}`, () => {
      expect(normalizeFinish(input)).toBe(output)
    })
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- normalize-finish`
Expected: FAIL — `Cannot find module '../normalize-finish'` (the module doesn't exist yet).

- [ ] **Step 3: Create the extracted module**

Create `storefront/src/lib/fitment/normalize-finish.ts`:

```ts
import { Finish } from "@modules/common/components/wheel"

/**
 * Collapse a free-text vendor finish into the 3-bucket Finish enum
 * (black | bronze | silver). Precedence:
 *   1. bronze/gold/copper/brass → bronze
 *   2. an explicit "black" token → black (dominates a silver accent)
 *   3. silver/chrome/machined/milled/polished/gunmetal/grey/gray/titanium/graphite → silver
 *   4. everything else (incl. unknowns) → black
 *
 * LOCKSTEP: twin of backend/src/modules/vendor-sync/search/normalize-finish.ts.
 * Both are guarded against drift by fixtures/finish-normalize-golden.json
 * (see __tests__/normalize-finish.test.ts here + the backend golden test).
 * Update the golden and both copies together.
 */
export function normalizeFinish(raw: unknown): Finish {
  const s = String(raw ?? "").toLowerCase()
  if (/bronze|gold|copper|brass/.test(s)) return "bronze"
  if (s.includes("black")) return "black"
  if (/silver|chrome|machined|milled|polished|gunmetal|gr[ae]y|titanium|graphite/.test(s))
    return "silver"
  return "black"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && pnpm test:unit -- normalize-finish`
Expected: PASS, all golden vectors green.

- [ ] **Step 5: Swap the inline copy in `get-product.ts` for the import**

In `storefront/src/modules/product-detail/data/get-product.ts`:
1. Delete the inline `normalizeFinish` function and its leading comment block (currently ~lines 26-36, the `// Byte-equivalent ...` comment through the closing `}`).
2. Add to the import block near the top (alongside the other `@lib`/`@modules` imports):

```ts
import { normalizeFinish } from "@lib/fitment/normalize-finish"
```

Leave the two call sites (`normalizeFinish(pmeta.finish)` and `normalizeFinish(pmeta.finish)` in `getRelatedProducts`) unchanged — the extracted signature `(raw: unknown)` accepts them.

- [ ] **Step 6: Typecheck + full storefront suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc reports no NEW errors from this change; vitest PASS (existing 48 + new golden test).

- [ ] **Step 7: Commit**

```bash
git add storefront/src/lib/fitment/normalize-finish.ts storefront/src/lib/fitment/__tests__/normalize-finish.test.ts storefront/src/modules/product-detail/data/get-product.ts
git commit -m "refactor(pdp): extract normalizeFinish to lib + golden lockstep test (WB-030)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: WB-048 — placeholder bolt pattern is no longer a selectable gate

**Files:**
- Modify: `storefront/src/modules/product-detail/data/group-sizes.ts` (add `isRealBoltPattern`; placeholder size-keying)
- Modify: `storefront/src/modules/product-detail/data/group-sizes.test.ts` (new cases)
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (`.filter(isRealBoltPattern)`)
- Modify: `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` (hide row when ≤1 pattern)

**Interfaces:**
- Produces: `isRealBoltPattern(raw: unknown): boolean` exported from `group-sizes.ts` — used by `get-product.ts`.
- Note: `hero/index.tsx` needs NO change — it passes `product.boltPatternOptions` to `VariantPicker`, which owns the row. With placeholders filtered out of `boltPatternOptions`, the hero's `selectedBoltPattern = boltPatternOptions[0] ?? product.boltPattern` falls back to `""`, and `sizesForBoltPattern(sizes, "")` returns all sizes (existing fallback).

- [ ] **Step 1: Write the failing tests**

Add to `storefront/src/modules/product-detail/data/group-sizes.test.ts`. First extend the import to include `isRealBoltPattern`:

```ts
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
  boresFor,
  loadsFor,
  loadsForBore,
  resolveLeafVariant,
  isRealBoltPattern,
} from "./group-sizes"
```

Then append:

```ts
describe("isRealBoltPattern", () => {
  it("rejects placeholders (empty, whitespace, BLANK, N/A — any case)", () => {
    for (const raw of ["", "   ", "BLANK", "blank", "Blank", "N/A", "n/a", null, undefined]) {
      expect(isRealBoltPattern(raw)).toBe(false)
    }
  })
  it("accepts real patterns", () => {
    for (const raw of ["5x114.3", "5X114.3", "6x139.7", "6X135/5.5"]) {
      expect(isRealBoltPattern(raw)).toBe(true)
    }
  })
})

describe("groupVariantsIntoSizes — placeholder bolt patterns", () => {
  it("keys a BLANK-pattern variant under '' so it stays reachable via the all-sizes fallback", () => {
    const sizes = groupVariantsIntoSizes(
      [variant("v_blank", 20, 9, 18, "BLANK", 10, 300)],
      28
    )
    expect(sizes).toHaveLength(1)
    expect(sizes[0].boltPattern).toBe("")
    // The fallback surfaces it when no real pattern is selected.
    expect(sizesForBoltPattern(sizes, "")).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- group-sizes`
Expected: FAIL — `isRealBoltPattern is not a function` (not yet exported) and the BLANK-keying assertion fails (currently keyed as `"BLANK"`).

- [ ] **Step 3: Implement `isRealBoltPattern` + placeholder size-keying**

In `storefront/src/modules/product-detail/data/group-sizes.ts`, add after the `numOrNull` helper (~line 10):

```ts
/** Vendor placeholders that must never become a selectable bolt-pattern gate. */
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a"])

/**
 * True when a vendor `bolt_pattern_raw` is a real, selectable pattern (not a
 * placeholder like "" / "BLANK" / "N/A"). Used to keep placeholder values out of
 * the PDP bolt-pattern picker (WB-048) — they would otherwise become a clickable
 * grid-gating chip once WB-003 made the bolt-pattern row load-bearing.
 */
export function isRealBoltPattern(raw: unknown): boolean {
  return !PLACEHOLDER_BOLT_PATTERNS.has(String(raw ?? "").trim().toLowerCase())
}
```

Then in `groupVariantsIntoSizes`, change the bolt-pattern key derivation (currently `const boltPattern = String(m.bolt_pattern_raw ?? "")`) to:

```ts
    const rawBp = String(m.bolt_pattern_raw ?? "")
    const boltPattern = isRealBoltPattern(rawBp) ? rawBp : ""
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd storefront && pnpm test:unit -- group-sizes`
Expected: PASS (new cases + all existing group-sizes cases).

- [ ] **Step 5: Filter placeholders out of `boltPatternOptions` in the loader**

In `storefront/src/modules/product-detail/data/get-product.ts`:
1. Extend the existing import from `./group-sizes` to include `isRealBoltPattern`:

```ts
import { num, groupVariantsIntoSizes, isRealBoltPattern } from "./group-sizes"
```

2. Change the `boltPatterns` derivation in `mapToDetail` from `.filter(Boolean)` to `.filter(isRealBoltPattern)`:

```ts
  const boltPatterns = Array.from(
    new Set(
      variants
        .map((v) => String((v.metadata as any)?.bolt_pattern_raw ?? ""))
        .filter(isRealBoltPattern)
    )
  )
```

This transitively cleans `boltPatternOptions`, `boltPatternsCanonical` (derived from `boltPatterns`), and `boltPattern` (= `boltPatterns[0] ?? ""`).

- [ ] **Step 6: Hide the bolt-pattern row when there is ≤1 real pattern**

In `storefront/src/modules/product-detail/components/hero/variant-picker.tsx`, wrap the entire "Bolt pattern row" block (the `<div>` containing the `Label` "Bolt pattern" and the `boltPatterns.map(...)`, currently ~lines 104-129) in a guard:

```tsx
      {/* Bolt pattern row — hidden when there's nothing meaningful to choose
          (≤1 real pattern). Placeholder patterns are already filtered upstream. */}
      {boltPatterns.length > 1 && (
        <div>
          <Label tone="muted" style={{ display: "block", marginBottom: 8 }}>
            Bolt pattern
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {boltPatterns.map((bp) => {
              const active = bp === selectedBoltPattern
              return (
                <button
                  key={bp}
                  type="button"
                  onClick={() => onBoltPatternChange(bp)}
                  className={cn(
                    "h-10 px-4 rounded-[var(--radius)] border text-[13px] font-semibold transition-colors",
                    active
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                      : "border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
                  )}
                >
                  {bp}
                </button>
              )
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 7: Typecheck + manual PDP smoke**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no new errors; vitest PASS.

Manual smoke (document the result in the commit/PR, not a code change): with the backend running, open a PDP for a product known to carry a `"BLANK"` `bolt_pattern_raw` (e.g. a `performance-replicas` product) and confirm (a) no "BLANK" chip in the picker, (b) sizes still render, (c) a single-pattern product shows no bolt-pattern row at all. If a backend isn't available, state that the smoke was deferred — do NOT claim it passed.

- [ ] **Step 8: Commit**

```bash
git add storefront/src/modules/product-detail/data/group-sizes.ts storefront/src/modules/product-detail/data/group-sizes.test.ts storefront/src/modules/product-detail/data/get-product.ts storefront/src/modules/product-detail/components/hero/variant-picker.tsx
git commit -m "fix(pdp): drop placeholder BLANK bolt pattern as a selectable gate (WB-048)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: WB-029a — PDP config module (qty default, low-stock threshold, ship copy)

**Files:**
- Create: `storefront/src/modules/product-detail/data/pdp-config.ts`
- Modify: `storefront/src/modules/product-detail/data/group-sizes.ts` (`availabilityOf` takes a threshold; export it)
- Modify: `storefront/src/modules/product-detail/data/group-sizes.test.ts` (threshold cases)
- Modify: `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx` (qty default + trust strip from config)
- Modify: `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` (lead-time copy from config)

**Interfaces:**
- Produces: from `pdp-config.ts` — `DEFAULT_WHEEL_QTY: number`, `LOW_STOCK_THRESHOLD: number`, `FREE_SHIP_THRESHOLD_USD: number`, `SHIP_LEAD_TIME: string`, `TRUST_STRIP: { icon: "shipping"|"shield"|"return"; heading: string; sub: string }[]`.
- Produces: `availabilityOf(qty: number, threshold?: number): SizeOption["availability"]` exported from `group-sizes.ts`.

- [ ] **Step 1: Create the PDP config module**

Create `storefront/src/modules/product-detail/data/pdp-config.ts`:

```ts
/**
 * PDP presentation config (WB-029). De-hardcodes values that were literals in
 * the PDP components. Each numeric reads an optional NEXT_PUBLIC_PDP_* env
 * override, else the default. These are display defaults — NOT authoritative
 * product data (construction/origin/warranty come from product metadata; see
 * get-product.ts).
 */

const intEnv = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Default quantity selected on the PDP — wheels sell in sets of 4. */
export const DEFAULT_WHEEL_QTY = intEnv(process.env.NEXT_PUBLIC_PDP_DEFAULT_QTY, 4)

/** On-hand count at or below which a size shows "low stock". */
export const LOW_STOCK_THRESHOLD = intEnv(process.env.NEXT_PUBLIC_PDP_LOW_STOCK_THRESHOLD, 4)

/** Free-shipping order threshold shown in the trust strip (USD). */
export const FREE_SHIP_THRESHOLD_USD = intEnv(process.env.NEXT_PUBLIC_PDP_FREE_SHIP_USD, 199)

/** Lead-time copy on in-stock sizes. */
export const SHIP_LEAD_TIME = process.env.NEXT_PUBLIC_PDP_SHIP_LEAD_TIME ?? "ships 2–3 days"

/** Trust-strip cells in the purchase panel. */
export const TRUST_STRIP: { icon: "shipping" | "shield" | "return"; heading: string; sub: string }[] = [
  { icon: "shipping", heading: "Free shipping", sub: `Orders $${FREE_SHIP_THRESHOLD_USD}+` },
  { icon: "shield", heading: "Fitment guarantee", sub: "Or money back" },
  { icon: "return", heading: "30-day returns", sub: "Unmounted" },
]
```

- [ ] **Step 2: Write the failing threshold test**

Add to `storefront/src/modules/product-detail/data/group-sizes.test.ts`. Extend the import to include `availabilityOf`:

```ts
import {
  groupVariantsIntoSizes,
  sizesForBoltPattern,
  pickDefaultSize,
  boresFor,
  loadsFor,
  loadsForBore,
  resolveLeafVariant,
  isRealBoltPattern,
  availabilityOf,
} from "./group-sizes"
```

Append:

```ts
describe("availabilityOf — configurable low-stock threshold", () => {
  it("uses the default threshold (4) when none is passed", () => {
    expect(availabilityOf(0)).toBe("out_of_stock")
    expect(availabilityOf(4)).toBe("low_stock")
    expect(availabilityOf(5)).toBe("in_stock")
  })
  it("honors an explicit threshold", () => {
    expect(availabilityOf(2, 2)).toBe("low_stock")
    expect(availabilityOf(3, 2)).toBe("in_stock")
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- group-sizes`
Expected: FAIL — `availabilityOf is not a function` (not exported / no threshold param yet).

- [ ] **Step 4: Make `availabilityOf` configurable + exported**

In `storefront/src/modules/product-detail/data/group-sizes.ts`:
1. Add the import at the top:

```ts
import { LOW_STOCK_THRESHOLD } from "./pdp-config"
```

2. Replace the existing `availabilityOf` (currently `function availabilityOf(qty: number)` with the hardcoded `qty <= 4`) with:

```ts
export function availabilityOf(
  qty: number,
  threshold: number = LOW_STOCK_THRESHOLD
): SizeOption["availability"] {
  if (qty <= 0) return "out_of_stock"
  if (qty <= threshold) return "low_stock"
  return "in_stock"
}
```

The existing call inside `groupVariantsIntoSizes` (`const avail = availabilityOf(qty)`) stays unchanged — it now uses the configured default.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd storefront && pnpm test:unit -- group-sizes`
Expected: PASS (threshold cases + all existing cases — default-4 behavior is unchanged).

- [ ] **Step 6: Wire the qty default + trust strip in the purchase panel**

In `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`:
1. Add the import:

```ts
import { DEFAULT_WHEEL_QTY, TRUST_STRIP } from "../../data/pdp-config"
```

2. Change the quantity state initializer (currently `useState(4) // wheels sell in sets of 4 by default`) to:

```ts
  const [quantity, setQuantity] = useState(DEFAULT_WHEEL_QTY)
```

3. Replace the inline trust-strip array (the `[{ i: "shipping" as const, h: "Free shipping", s: "Orders $199+" }, ...]` block and its `.map`) with `TRUST_STRIP`:

```tsx
      {/* Trust strip — compressed for the purchase panel */}
      <div className="grid grid-cols-3 gap-4 pt-6 mt-2">
        {TRUST_STRIP.map((t) => (
          <div key={t.heading} className="flex items-start gap-2.5">
            <Icon name={t.icon} size={20} strokeWidth={1.4} />
            <div>
              <div className="text-[12px] font-semibold text-[var(--ink)]">
                {t.heading}
              </div>
              <div className="text-[10px] text-[var(--ink-soft)] mt-0.5">
                {t.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
```

- [ ] **Step 7: Wire the lead-time copy in the variant picker**

In `storefront/src/modules/product-detail/components/hero/variant-picker.tsx`:
1. Add the import:

```ts
import { SHIP_LEAD_TIME } from "../../data/pdp-config"
```

2. Change the `AVAILABILITY_LABEL` `in_stock` entry (currently `in_stock: "In stock — ships 2–3 days"`) to use the constant. Since `AVAILABILITY_LABEL` is a module-level `const`, build the `in_stock` string from the config value:

```ts
const AVAILABILITY_LABEL: Record<SizeOption["availability"], string> = {
  in_stock: `In stock — ${SHIP_LEAD_TIME}`,
  low_stock: "Low stock — last few sets",
  out_of_stock: "Out of stock",
}
```

- [ ] **Step 8: Typecheck + full storefront suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no new errors; vitest PASS.

- [ ] **Step 9: Commit**

```bash
git add storefront/src/modules/product-detail/data/pdp-config.ts storefront/src/modules/product-detail/data/group-sizes.ts storefront/src/modules/product-detail/data/group-sizes.test.ts storefront/src/modules/product-detail/components/hero/purchase-panel.tsx storefront/src/modules/product-detail/components/hero/variant-picker.tsx
git commit -m "refactor(pdp): de-hardcode qty default, low-stock threshold, ship copy to config (WB-029)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: WB-029b — specs grid reads admin metadata, hides empty rows

**Files:**
- Modify: `storefront/src/modules/product-detail/data/types.ts` (`specs` construction/origin/warranty → `string | null`)
- Modify: `storefront/src/modules/product-detail/data/get-product.ts` (read optional metadata, default `null`)
- Modify: `storefront/src/modules/product-detail/components/specs/index.tsx` (omit null rows)

**Interfaces:**
- Consumes: `ProductDetail.specs` (modified shape).
- Produces: nothing new for downstream tasks (this is the last task).

- [ ] **Step 1: Relax the `specs` type**

In `storefront/src/modules/product-detail/data/types.ts`, change the three fields in the `specs` object type (currently each `string`) to `string | null`:

```ts
  /** Per-spec values for the Specs grid. */
  specs: {
    /** Admin-set product metadata; null when absent (no vendor source for wheels). */
    construction: string | null
    weightLb: number
    loadRatingLb: number
    centerBoreMm: number
    hubBoreMm?: number
    /** Admin-set product metadata; null when absent. */
    countryOfOrigin: string | null
    /** Admin-set product metadata; null when absent. */
    warranty: string | null
    finishOptions: number
  }
```

- [ ] **Step 2: Read optional metadata in the loader (default null, not "—")**

In `storefront/src/modules/product-detail/data/get-product.ts`, in `mapToDetail`'s returned `specs` object, change the three placeholder fields. Currently:

```ts
    specs: {
      construction: "—", // Spec §5: not in vendor data (plan gap 4.1).
      weightLb,
      loadRatingLb: num(rep.load_rating_lb),
      centerBoreMm: num(rep.center_bore_mm),
      countryOfOrigin: "—",
      warranty: "—",
      finishOptions: 1,
    },
```

Replace with (reads admin-set product metadata if present, else null — no fabricated "—"):

```ts
    specs: {
      // No vendor source for wheels — surface admin-set metadata if present, else hide (WB-029).
      construction: (typeof pmeta.construction === "string" && pmeta.construction) || null,
      weightLb,
      loadRatingLb: num(rep.load_rating_lb),
      centerBoreMm: num(rep.center_bore_mm),
      countryOfOrigin:
        (typeof pmeta.country_of_origin === "string" && pmeta.country_of_origin) || null,
      warranty: (typeof pmeta.warranty === "string" && pmeta.warranty) || null,
      finishOptions: 1,
    },
```

(`pmeta` is the already-declared `product.metadata` record at the top of `mapToDetail`.)

- [ ] **Step 3: Omit null rows in the specs grid**

In `storefront/src/modules/product-detail/components/specs/index.tsx`, change the `rows` array so the three optional rows are conditionally included (mirroring the existing `hubBoreMm` pattern). Replace the `rows` declaration with:

```tsx
  const rows: { label: string; value: string }[] = [
    ...(product.specs.construction
      ? [{ label: "Construction", value: product.specs.construction }]
      : []),
    { label: "Per-wheel weight", value: `${product.specs.weightLb} lb` },
    { label: "Load rating", value: `${product.specs.loadRatingLb.toLocaleString()} lb` },
    { label: "Center bore", value: `${product.specs.centerBoreMm} mm` },
    ...(product.specs.hubBoreMm
      ? [{ label: "Hub bore", value: `${product.specs.hubBoreMm} mm` }]
      : []),
    ...(product.specs.countryOfOrigin
      ? [{ label: "Country of origin", value: product.specs.countryOfOrigin }]
      : []),
    ...(product.specs.warranty
      ? [{ label: "Warranty", value: product.specs.warranty }]
      : []),
    { label: "Finish options", value: `${product.specs.finishOptions}` },
  ]
```

- [ ] **Step 4: Typecheck + full storefront suite + manual smoke**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no new errors (the `string | null` change is consumed only by the conditional rows); vitest PASS.

Manual smoke (document, don't fake): open a PDP for a vendor product with no construction/origin/warranty metadata → those three spec cells are absent (no "—"); the grid still renders weight / load / center bore / finish options.

- [ ] **Step 5: Commit**

```bash
git add storefront/src/modules/product-detail/data/types.ts storefront/src/modules/product-detail/data/get-product.ts storefront/src/modules/product-detail/components/specs/index.tsx
git commit -m "fix(pdp): hide empty construction/origin/warranty specs instead of '—' (WB-029)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- WB-048 (placeholder bolt pattern) → Task 3 (filter + size-keying + hide row). ✓
- WB-029 (qty default, low-stock threshold, ship copy, specs placeholders) → Task 4 (config + threshold + copy) + Task 5 (specs hide-null). ✓
- WB-030 (normalizeFinish twin) → Task 1 (fixture + backend test) + Task 2 (storefront extract + test). ✓
- Spec "out of scope" (WB-053, photography, tires) → not in any task. ✓ (intentional)

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step shows full code. ✓

**Type consistency:** `isRealBoltPattern(raw: unknown): boolean`, `availabilityOf(qty, threshold?)`, `normalizeFinish(raw: unknown): Finish`, `specs.{construction,countryOfOrigin,warranty}: string | null`, `TRUST_STRIP` icon union `"shipping"|"shield"|"return"` (matches `Icon` names used today) — names/signatures consistent across tasks. ✓

**Verification (whole group):** `cd storefront && pnpm test:unit` (group-sizes + normalize-finish green, 48 existing pass), `cd backend && pnpm test:sync` (normalize-finish-golden green), `cd storefront && npx tsc --noEmit` (no new errors), manual PDP smoke for WB-048 + WB-029b.
