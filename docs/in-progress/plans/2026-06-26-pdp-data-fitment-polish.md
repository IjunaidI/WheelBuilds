# PDP data honesty & fitment polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wheel PDP tell the truth — real fitment verdict in the purchase chip, real (already-saved) weight fetched + all placeholder "0" specs hidden, and a properly-sized finish swatch.

**Architecture:** All storefront. The data-honesty core is a pure, unit-tested `buildSpecRows` helper; the rest is thin presentational wiring reusing the existing pure `fitsVehicle`. No backend change, no migration, no catalog re-import (weight is already persisted by the importer; the PDP just wasn't fetching it).

**Tech Stack:** Next.js 15 / React 19 storefront, Vitest, TypeScript.

Spec: [docs/in-progress/specs/2026-06-26-pdp-data-fitment-polish-design.md](../specs/2026-06-26-pdp-data-fitment-polish-design.md)

## Global Constraints

- **No `wb-`/`WB`/`wheelbuilds-` prefix** on any identifier, file, export, or CSS class.
- **Storefront tests:** `cd storefront && pnpm test:unit` (= `vitest run`). Focused: append `-- <name>`.
- **Storefront typecheck:** `cd storefront && npx tsc --noEmit` — **14 pre-existing errors on `main`** (in `lib/data/*`, `product-detail/data/resolve-variant.test.ts`, `modules/products/*`). Do NOT fix them; only confirm your change adds **no NEW** errors.
- **Path aliases (storefront):** `@lib/*` → `src/lib/*`, `@modules/*` → `src/modules/*`. `@/*` is shadcn-only.
- `fitsVehicle(product, vehicle): { fits, hardGatesPass, withinWindow, reasons }` is a PURE, already-unit-tested function at `@lib/fitment/fits-vehicle` — reuse it; do not reimplement fitment logic.
- Weight is ALREADY persisted on `product.weight` (grams) by the backend — no backend edit. The only weight bug is that the PDP query doesn't request the field.
- `pnpm` may not be on PATH on Windows — fall back to `npx -y pnpm@9.10.0 <script>`.
- One commit per task. End each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Real weight fetched + no placeholder specs (Fix C)

**Files:**
- Create: `storefront/src/modules/product-detail/components/specs/spec-rows.ts`
- Create: `storefront/src/modules/product-detail/components/specs/spec-rows.test.ts`
- Modify: `storefront/src/lib/data/products.ts` (`getProductByHandle` fields, line ~36)
- Modify: `storefront/src/modules/product-detail/components/specs/index.tsx` (use `buildSpecRows`)
- Modify: `storefront/src/modules/product-detail/components/hero/variant-picker.tsx` (gate the weight stat + tooltip fragment)

**Interfaces:**
- Produces: `buildSpecRows(specs: ProductDetail["specs"]): { label: string; value: string }[]` from `./spec-rows`.

- [ ] **Step 1: Write the failing test**

Create `storefront/src/modules/product-detail/components/specs/spec-rows.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildSpecRows } from "./spec-rows"

// A spec object where every numeric is 0/placeholder and every string is null.
const base = {
  construction: null,
  weightLb: 0,
  loadRatingLb: 0,
  centerBoreMm: 0,
  countryOfOrigin: null,
  warranty: null,
  finishOptions: 1,
} as any

const labels = (specs: any) => buildSpecRows(specs).map((r) => r.label)

describe("buildSpecRows", () => {
  it("omits every zero/missing field — no fake placeholders", () => {
    expect(buildSpecRows(base)).toEqual([])
  })
  it("shows real weight in lb when > 0", () => {
    expect(buildSpecRows({ ...base, weightLb: 32 })).toEqual([
      { label: "Per-wheel weight", value: "32 lb" },
    ])
  })
  it("shows load rating in lb when > 0", () => {
    expect(buildSpecRows({ ...base, loadRatingLb: 800 })).toEqual([
      { label: "Load rating", value: "800 lb" },
    ])
  })
  it("shows center bore + hub bore when present", () => {
    expect(labels({ ...base, centerBoreMm: 73, hubBoreMm: 64.1 })).toEqual([
      "Center bore",
      "Hub bore",
    ])
  })
  it("hides finishOptions when 1, shows when > 1", () => {
    expect(labels(base)).not.toContain("Finish options")
    expect(labels({ ...base, finishOptions: 3 })).toContain("Finish options")
  })
  it("shows admin string fields only when set", () => {
    expect(labels({ ...base, construction: "Forged", warranty: "Limited lifetime" })).toEqual([
      "Construction",
      "Warranty",
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd storefront && pnpm test:unit -- spec-rows`
Expected: FAIL — `Cannot find module './spec-rows'`.

- [ ] **Step 3: Implement the helper**

Create `storefront/src/modules/product-detail/components/specs/spec-rows.ts`:

```ts
import { ProductDetail } from "../../data/types"

export type SpecRow = { label: string; value: string }

/**
 * The visible spec rows for a wheel. Real values only — any numeric field that
 * is 0/missing is OMITTED rather than rendered as a fake "0 lb"/"0 mm". The
 * admin-metadata string fields (construction/origin/warranty) keep the WB-029
 * null-guard; this extends the same honesty to the numerics + the always-"1"
 * finish-options count. (WB-056)
 */
export function buildSpecRows(specs: ProductDetail["specs"]): SpecRow[] {
  const rows: SpecRow[] = []
  if (specs.construction) rows.push({ label: "Construction", value: specs.construction })
  if (specs.weightLb > 0) rows.push({ label: "Per-wheel weight", value: `${specs.weightLb} lb` })
  if (specs.loadRatingLb > 0)
    rows.push({ label: "Load rating", value: `${specs.loadRatingLb.toLocaleString()} lb` })
  if (specs.centerBoreMm > 0) rows.push({ label: "Center bore", value: `${specs.centerBoreMm} mm` })
  if (specs.hubBoreMm) rows.push({ label: "Hub bore", value: `${specs.hubBoreMm} mm` })
  if (specs.countryOfOrigin)
    rows.push({ label: "Country of origin", value: specs.countryOfOrigin })
  if (specs.warranty) rows.push({ label: "Warranty", value: specs.warranty })
  if (specs.finishOptions > 1)
    rows.push({ label: "Finish options", value: `${specs.finishOptions}` })
  return rows
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && pnpm test:unit -- spec-rows`
Expected: PASS (6 cases).

- [ ] **Step 5: Fetch the weight in the PDP product query**

In `storefront/src/lib/data/products.ts`, find the `getProductByHandle` `fields` line (~line 36):

```ts
        fields: "*variants.calculated_price,+variants.inventory_quantity,+collection_id",
```

Change it to also request `weight`:

```ts
        fields: "*variants.calculated_price,+variants.inventory_quantity,+collection_id,+weight",
```

(Leave the other two `fields` strings in this file — the list query at ~line 20 and ~line 73 — unchanged; they don't drive the PDP specs.)

- [ ] **Step 6: Wire `buildSpecRows` into the specs grid**

In `storefront/src/modules/product-detail/components/specs/index.tsx`:
1. Add the import (next to the existing `../../data/types` import):

```ts
import { buildSpecRows } from "./spec-rows"
```

2. Replace the entire inline `const rows: { label: string; value: string }[] = [ ... ]` array (the block that lists Construction / Per-wheel weight / Load rating / Center bore / Hub bore / Country of origin / Warranty / Finish options) with a single call:

```ts
  const rows = buildSpecRows(product.specs)
```

The existing `rows.map((row) => …)` render below stays exactly as is.

- [ ] **Step 7: Gate the variant-picker weight stat + tooltip fragment**

In `storefront/src/modules/product-detail/components/hero/variant-picker.tsx`:

1. The bottom "Weight / Status" readout — currently:

```tsx
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--hairline)]">
        <Stat label="Weight" value={`${selectedSize.weightLb} lb`} />
        <Stat
          label="Status"
```

Gate the Weight `<Stat>` so it only renders for a real weight (Status keeps its place):

```tsx
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--hairline)]">
        {selectedSize.weightLb > 0 && (
          <Stat label="Weight" value={`${selectedSize.weightLb} lb`} />
        )}
        <Stat
          label="Status"
```

2. The size tooltip — currently:

```tsx
                  <div className="text-[10px] opacity-80">
                    {s.weightLb} lb · {AVAILABILITY_LABEL[s.availability]}
                  </div>
```

Drop the weight fragment when the weight is 0:

```tsx
                  <div className="text-[10px] opacity-80">
                    {s.weightLb > 0 ? `${s.weightLb} lb · ` : ""}
                    {AVAILABILITY_LABEL[s.availability]}
                  </div>
```

- [ ] **Step 8: Typecheck + full suite**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors; vitest PASS (existing 89 + 6 new `spec-rows` = 95).

- [ ] **Step 9: Commit**

```bash
git add storefront/src/modules/product-detail/components/specs/spec-rows.ts storefront/src/modules/product-detail/components/specs/spec-rows.test.ts storefront/src/lib/data/products.ts storefront/src/modules/product-detail/components/specs/index.tsx storefront/src/modules/product-detail/components/hero/variant-picker.tsx
git commit -m "fix(pdp): fetch real product weight + hide zero/placeholder specs (WB-056)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Purchase-panel fitment chip tells the truth (Fix A)

**Files:**
- Modify: `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`

**Interfaces:**
- Consumes: `fitsVehicle(product, vehicle).fits: boolean` from `@lib/fitment/fits-vehicle`; `useGarage().active` (already imported in this file).

- [ ] **Step 1: Compute the real verdict**

In `storefront/src/modules/product-detail/components/hero/purchase-panel.tsx`:
1. Add the import (next to the other `@lib` imports):

```ts
import { fitsVehicle } from "@lib/fitment/fits-vehicle"
```

2. Just after `const { active } = useGarage()`, add:

```ts
  const fits = active ? fitsVehicle(product, active).fits : false
```

- [ ] **Step 2: Make the chip three-state**

Replace the existing Fitment chip block (the `{active ? ( <Chip variant="accent" dot>CONFIRMED FIT …</Chip> ) : ( <Chip variant="outline" onClick={openSearch}>… Pick a vehicle …</Chip> )}` inside the `{/* Fitment chip */}` div) with:

```tsx
      {/* Fitment chip — real fitsVehicle verdict, never a blanket "confirmed". */}
      <div className="mt-5">
        {active ? (
          fits ? (
            <Chip variant="accent" dot>
              CONFIRMED FIT · {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          ) : (
            <Chip variant="outline">
              MAY NOT FIT · {active.year} {active.make.toUpperCase()}{" "}
              {active.model.toUpperCase()}
            </Chip>
          )
        ) : (
          <Chip variant="outline" onClick={openSearch}>
            <Icon name="garage" size={12} strokeWidth={1.6} />
            Pick a vehicle to confirm fit
          </Chip>
        )}
      </div>
```

- [ ] **Step 3: Typecheck + full suite + manual-smoke note**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors; vitest PASS (95 — unchanged by this presentational task).

Manual smoke (document, don't fabricate — a live backend is likely unavailable): with a garage vehicle that
fits → orange "CONFIRMED FIT"; a garage vehicle that does NOT fit → neutral "MAY NOT FIT" (no orange dot);
no vehicle → "Pick a vehicle to confirm fit". State clearly if deferred. (`fitsVehicle` is already unit-tested,
so the verdict logic itself is covered; this task only re-wires the chip to it.)

- [ ] **Step 4: Commit**

```bash
git add storefront/src/modules/product-detail/components/hero/purchase-panel.tsx
git commit -m "fix(pdp): purchase-panel chip uses real fitsVehicle verdict, not blanket CONFIRMED FIT (WB-056)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Finish swatch is properly sized (Fix B)

**Files:**
- Modify: `storefront/src/modules/product-detail/components/hero/gallery.tsx`

**Interfaces:** none (presentational).

- [ ] **Step 1: Size the swatch + enlarge the wheel**

In `storefront/src/modules/product-detail/components/hero/gallery.tsx`, the finish-switcher button — currently:

```tsx
              className={`flex-1 aspect-square rounded-[var(--radius)] border-2 flex items-center justify-center transition-colors ${
                f === activeFinish
                  ? "border-[var(--orange)]"
                  : "border-[var(--hairline)] hover:border-[var(--ink-soft)]"
              }`}
              style={{ background: "var(--soft)" }}
            >
              <Wheel size={72} finish={f} />
            </button>
```

Change the button to a fixed 96px square (so a single finish is a tidy swatch, not a full-width box) and bump the wheel to fill it:

```tsx
              className={`w-24 h-24 shrink-0 rounded-[var(--radius)] border-2 flex items-center justify-center transition-colors ${
                f === activeFinish
                  ? "border-[var(--orange)]"
                  : "border-[var(--hairline)] hover:border-[var(--ink-soft)]"
              }`}
              style={{ background: "var(--soft)" }}
            >
              <Wheel size={80} finish={f} />
            </button>
```

(Only the button `className` `flex-1 aspect-square` → `w-24 h-24 shrink-0` and `<Wheel size={72}>` → `size={80}` change. The `flex gap-2` row wrapper, the `Label`, and the `onClick`/`aria` props stay.)

- [ ] **Step 2: Typecheck + full suite + manual-smoke note**

Run: `cd storefront && npx tsc --noEmit && pnpm test:unit`
Expected: tsc no NEW errors; vitest PASS (95).

Manual smoke (document, don't fabricate): the finish swatch renders as a tidy 96px square with an 80px wheel
filling it — no tiny wheel floating in a large empty box. State clearly if deferred.

- [ ] **Step 3: Commit**

```bash
git add storefront/src/modules/product-detail/components/hero/gallery.tsx
git commit -m "fix(pdp): finish swatch is a sized square, not a 72px wheel in an empty box (WB-056)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Fix A (fitment chip → fitsVehicle) → Task 2. ✓
- Fix B (swatch size) → Task 3. ✓
- Fix C1 (`+weight` fetch) → Task 1 Step 5. ✓
- Fix C2 (hide zero/placeholder specs; `buildSpecRows`; variant-picker gate) → Task 1. ✓
- Out of scope (visual redesign, multi-finish, weight rounding, AutoFitmentCard wording) → no task. ✓

**Placeholder scan:** every code step shows full code; no TBD/"handle edge cases"/"similar to Task N". ✓

**Type consistency:** `buildSpecRows(specs: ProductDetail["specs"]): { label; value }[]`, `fitsVehicle(product, active).fits`, `selectedSize.weightLb`/`s.weightLb` (number), `<Wheel size={n}>` — consistent with the spec and the actual types (`specs.weightLb`/`loadRatingLb`/`centerBoreMm`/`finishOptions` are `number`; `construction`/`countryOfOrigin`/`warranty` are `string | null`; `hubBoreMm?` optional). ✓

**Controller note:** file backlog item **WB-056 · PDP data honesty & fitment polish** at the doc closeout (not an implementer task).

**Whole-group verification:** `cd storefront && pnpm test:unit` (new `spec-rows` green; 95 total), `npx tsc --noEmit` (no new errors), plus the deferred manual PDP smoke (chip verdict; real/hidden weight; sized swatch).
