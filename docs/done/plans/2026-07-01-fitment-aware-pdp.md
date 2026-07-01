# Fitment-aware PDP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a shopper reaches a PDP via the "fits my car" flow (`?fit=1`), filter the hero's bolt-pattern / size / offset / color options to what fits their active vehicle and default to a fitting variant, with a warned "Show all" escape.

**Architecture:** A pure `buildFitView(product, vehicle)` computes the fitting subsets from the vehicle's wheel-size windows. The discovery product card carries a `?fit=1` flag to the PDP only when discovery is in fit mode. The client hero reads that flag + the active garage vehicle, and when fit mode is genuinely active (`hasFit`) it feeds the pickers the filtered options and re-snaps the selection to a fitting one; a `<FitBanner>` offers "Show all" behind a confirmation dialog.

**Tech Stack:** Next.js 15 / React 19 storefront, `useGarage()` client store, shadcn `Dialog` (`@/components/ui/dialog`), vitest.

## Global Constraints

- **No `wb-` / `WB` / `wheelbuilds-` prefixes** on any dir, file, export, type, or CSS class.
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Storefront-only.** No backend / API / migration / re-index.
- **Build ignores TS/lint** (`ignoreBuildErrors`/`ignoreDuringBuilds`) — run `npx tsc --noEmit` separately; **0 NEW errors** (a known baseline exists per storefront/CLAUDE.md: `lib/data/*`, `order-completed-template`, `product-onboarding-cta`, `related-products`, `resolve-variant.test.ts`).
- **`pnpm` may not be on PATH (Windows)** — run `npx tsc`/`npx vitest` directly from inside `storefront/`.
- **shadcn primitives** come from `@/components/ui/*`; don't hand-edit them. Portaled shadcn content already carries `frame` for WB tokens.
- **Fitment gate semantics match `lib/fitment/fits-vehicle.ts`** (bolt pattern ∈ vehicle's canonical patterns; wheel bore ≥ hub, null on either side passes; diameter/width/offset within window, a null window passes for that dimension).

## File structure

- **Create:** `storefront/src/modules/product-detail/data/fit-view.ts` — `buildFitView` + `FitView` type (pure).
- **Create:** `storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts`.
- **Create:** `storefront/src/modules/product-detail/components/hero/fit-banner.tsx` — the banner + warning dialog (client, presentational).
- **Modify:** `storefront/src/modules/product-detail/components/hero/index.tsx` — fit mode, filtered options, re-snap, `<FitBanner>`.
- **Modify (prop thread):** `storefront/src/app/[countryCode]/(main)/store/page.tsx`, `storefront/src/modules/discovery/templates/index.tsx`, `storefront/src/modules/discovery/components/grid/index.tsx`, `storefront/src/modules/discovery/components/grid/product-card.tsx`.

**Note on the spec's `defaults`:** the spec lists a `defaults` object on `FitView`. This plan realizes that behavior as "the hero re-snaps each axis to the first fitting option" (finish → `finishOptions[0]`, pattern → `boltPatterns[0]`, size → `pickDefaultSize(visibleSizes)`) instead of a separate object — identical user-facing behavior (PDP defaults to a fitting variant) with less cross-axis state to keep coherent. `FitView` is therefore `{ hasFit, boltPatterns, finishOptions }`.

---

### Task 1: `buildFitView` pure helper

**Files:**
- Create: `storefront/src/modules/product-detail/data/fit-view.ts`
- Test: `storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts`

**Interfaces:**
- Consumes: `FinishOption`, `SizeOption`, `ProductDetail` from `../types`; `canonicalBoltPatterns` from `@lib/fitment/canonical-bolt-pattern`.
- Produces: `type FitView = { hasFit: boolean; boltPatterns: string[]; finishOptions: FinishOption[] }` and `buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView`, where `FitVehicle = { canonicalBoltPatterns?: string[]; hubBoreMm?: number | null; diameterWindow?: Win; widthWindow?: Win; offsetWindow?: Win }` and `Win = { min: number; max: number } | null | undefined`. Task 3 consumes `buildFitView`.

- [ ] **Step 1: Write the failing test**

```ts
// storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts
import { describe, it, expect } from "vitest"
import { buildFitView } from "../fit-view"
import type { FinishOption, ProductDetail, SizeOption } from "../types"

// Minimal SizeOption factory — only the fields buildFitView reads.
const size = (
  diameter: number, width: number, boltPattern: string, offsetMm: number,
  bore: number | null = 64.1, avail: SizeOption["availability"] = "in_stock"
): SizeOption => ({
  diameter, width, offsetMm, oemOffsetMm: offsetMm, boltPattern, weightLb: 25, availability: avail,
  offsetVariants: [{ value: offsetMm, backspaceIn: "", variantId: `v-${diameter}x${width}-${offsetMm}`,
    availability: avail, centerBoreMm: bore, loadRatingLb: null }],
})

const finish = (raw: string, sizes: SizeOption[]): FinishOption =>
  ({ raw, normalized: "black", imageUrl: null, sizeOptions: sizes })

// A product offered in Matte Black (18x8 fits, 22x10 does not) and Chrome (only 22x10, does not fit).
const product = {
  boltPatternOptions: ["5x114.3"],
  finishOptions: [
    finish("Matte Black", [size(18, 8, "5x114.3", 40), size(22, 10, "5x114.3", 15)]),
    finish("Chrome", [size(22, 10, "5x114.3", 15)]),
  ],
} as unknown as ProductDetail

// Corolla-ish window: 17–19 in, 6.5–8.5 in, ET 35–50.
const vehicle = { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1,
  diameterWindow: { min: 17, max: 19 }, widthWindow: { min: 6.5, max: 8.5 }, offsetWindow: { min: 35, max: 50 } }

describe("buildFitView", () => {
  it("keeps only fitting sizes and drops finishes with no fitting size", () => {
    const fv = buildFitView(product, vehicle)
    expect(fv.hasFit).toBe(true)
    // Chrome (only 22x10, out of window) is dropped; Matte Black keeps only 18x8.
    expect(fv.finishOptions.map((f) => f.raw)).toEqual(["Matte Black"])
    expect(fv.finishOptions[0].sizeOptions.map((s) => `${s.diameter}x${s.width}`)).toEqual(["18x8"])
    expect(fv.boltPatterns).toEqual(["5x114.3"])
  })
  it("the effective default (first finish's default size) is a genuine fit", () => {
    const fv = buildFitView(product, vehicle)
    const s = fv.finishOptions[0].sizeOptions[0]
    expect(s.diameter).toBe(18)
    expect(s.width).toBe(8)
  })
  it("hasFit is false when no variant fits (bolt matches but size is out of window)", () => {
    const outOfWindow = { ...vehicle, diameterWindow: { min: 20, max: 24 } }
    const fv = buildFitView(product, outOfWindow)
    expect(fv.hasFit).toBe(false)
    expect(fv.finishOptions).toBe(product.finishOptions) // falls back to the full set
  })
  it("hasFit is false when the vehicle has no spec windows", () => {
    const fv = buildFitView(product, { canonicalBoltPatterns: ["5x114.3"], hubBoreMm: 60.1 })
    expect(fv.hasFit).toBe(false)
  })
  it("excludes a size whose bore is smaller than the hub", () => {
    const tightHub = { ...vehicle, hubBoreMm: 70 } // 18x8 bore 64.1 < 70 → excluded
    const fv = buildFitView(product, tightHub)
    expect(fv.hasFit).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd storefront && npx vitest run src/modules/product-detail/data/__tests__/fit-view.test.ts`
Expected: FAIL — cannot resolve `../fit-view`.

- [ ] **Step 3: Write `fit-view.ts`**

```ts
// storefront/src/modules/product-detail/data/fit-view.ts
import { canonicalBoltPatterns } from "@lib/fitment/canonical-bolt-pattern"
import type { FinishOption, ProductDetail, SizeOption } from "./types"

type Win = { min: number; max: number } | null | undefined

export type FitVehicle = {
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number | null
  diameterWindow?: Win
  widthWindow?: Win
  offsetWindow?: Win
}

export type FitView = {
  /** ≥1 fitting variant AND the vehicle has ≥1 spec window. False → callers show everything. */
  hasFit: boolean
  /** Only the fitting bolt patterns (subset of product.boltPatternOptions). */
  boltPatterns: string[]
  /** Only finishes with ≥1 fitting variant; each finish's sizeOptions trimmed to fitting sizes. */
  finishOptions: FinishOption[]
}

const inWin = (v: number, w: Win): boolean => (!w ? true : v >= w.min && v <= w.max)

/**
 * A size fits the vehicle when its bolt pattern is one of the vehicle's canonical
 * patterns, its diameter/width are within window, and it has ≥1 offset variant
 * whose ET is within the offset window and whose bore clears the hub. Mirrors the
 * gate semantics in lib/fitment/fits-vehicle.ts (null bore / null window pass).
 */
function sizeFits(size: SizeOption, vehicle: FitVehicle): boolean {
  const vPats = vehicle.canonicalBoltPatterns ?? []
  const boltOk =
    vPats.length > 0 && canonicalBoltPatterns(size.boltPattern).some((p) => vPats.includes(p))
  if (!boltOk) return false
  if (!inWin(size.diameter, vehicle.diameterWindow)) return false
  if (!inWin(size.width, vehicle.widthWindow)) return false

  const hub = vehicle.hubBoreMm ?? null
  const boreClears = (bore: number | null) => hub == null || bore == null || bore >= hub

  const offsets = size.offsetVariants ?? []
  if (offsets.length === 0) return inWin(size.offsetMm, vehicle.offsetWindow) && boreClears(null)
  return offsets.some((o) => inWin(o.value, vehicle.offsetWindow) && boreClears(o.centerBoreMm))
}

export function buildFitView(product: ProductDetail, vehicle: FitVehicle): FitView {
  const noFit: FitView = {
    hasFit: false,
    boltPatterns: product.boltPatternOptions,
    finishOptions: product.finishOptions,
  }

  const haveWindow = !!(vehicle.diameterWindow || vehicle.widthWindow || vehicle.offsetWindow)
  if (!haveWindow) return noFit

  const finishOptions: FinishOption[] = product.finishOptions
    .map((f) => ({ ...f, sizeOptions: f.sizeOptions.filter((s) => sizeFits(s, vehicle)) }))
    .filter((f) => f.sizeOptions.length > 0)

  if (finishOptions.length === 0) return noFit

  const boltPatterns = Array.from(
    new Set(finishOptions.flatMap((f) => f.sizeOptions.map((s) => s.boltPattern)))
  ).filter((p) => product.boltPatternOptions.includes(p))

  return {
    hasFit: true,
    boltPatterns: boltPatterns.length ? boltPatterns : product.boltPatternOptions,
    finishOptions,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd storefront && npx vitest run src/modules/product-detail/data/__tests__/fit-view.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd storefront && npx tsc --noEmit` → no new errors mentioning `fit-view`.

```bash
git add storefront/src/modules/product-detail/data/fit-view.ts \
  storefront/src/modules/product-detail/data/__tests__/fit-view.test.ts
git commit -m "$(cat <<'EOF'
feat(pdp): pure buildFitView — fitting bolt/size/color subsets for a vehicle

Given a product's finish/size options and a vehicle's wheel-size windows, returns
the fitting bolt patterns + finishes (each trimmed to fitting sizes). hasFit=false
(→ show everything) when the vehicle has no windows or nothing fits.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Carry the `?fit=1` flag from discovery to the PDP

**Files:**
- Modify: `storefront/src/modules/discovery/components/grid/product-card.tsx`
- Modify: `storefront/src/modules/discovery/components/grid/index.tsx`
- Modify: `storefront/src/modules/discovery/templates/index.tsx`
- Modify: `storefront/src/app/[countryCode]/(main)/store/page.tsx`

**Interfaces:**
- Produces: an optional `fit?: boolean` prop on `DiscoveryProductCard` and `DiscoveryGrid` (default `false`). Only the discovery store page (in fit mode) sets it true; the PDP "Similar wheels" row and home rail leave it default → no flag. Task 3 reads `?fit=1` on the PDP.

- [ ] **Step 1: Add the optional flag to the product card**

In `storefront/src/modules/discovery/components/grid/product-card.tsx`, change the props type and the href:

```tsx
type DiscoveryProductCardProps = {
  product: DiscoveryProduct
  /** When true (discovery fit mode), link to the PDP with ?fit=1 so the PDP filters variants to the active vehicle. */
  fit?: boolean
}

const DiscoveryProductCard = ({ product, fit = false }: DiscoveryProductCardProps) => (
  <LocalizedClientLink
    href={`/products/${product.handle}${fit ? "?fit=1" : ""}`}
    className="product-card group block"
    aria-label={`${product.brand} ${product.name}`}
  >
```

(Leave the rest of the component unchanged.)

- [ ] **Step 2: Thread it through the grid**

In `storefront/src/modules/discovery/components/grid/index.tsx`:

```tsx
type DiscoveryGridProps = {
  products: DiscoveryProduct[]
  fit?: boolean
}

const DiscoveryGrid = ({ products, fit = false }: DiscoveryGridProps) => (
  <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
    {products.map((p) => (
      <li key={p.id}>
        <DiscoveryProductCard product={p} fit={fit} />
      </li>
    ))}
  </ul>
)
```

- [ ] **Step 3: Thread it through the template**

In `storefront/src/modules/discovery/templates/index.tsx`, add `fit` to the props and pass it to the grid:

```tsx
type DiscoveryTemplateProps = {
  result: DiscoveryResult
  currentPage: number
  fit?: boolean
}

const DiscoveryTemplate = ({ result, currentPage, fit = false }: DiscoveryTemplateProps) => {
```

and in the JSX where the grid renders:

```tsx
              <DiscoveryGrid products={result.products} fit={fit} />
```

- [ ] **Step 4: Set the flag from the store page**

In `storefront/src/app/[countryCode]/(main)/store/page.tsx`, compute fit mode from the parsed query (the `?fit=` param populates `query.vehicleConstraint`) and pass it:

```tsx
export default async function StorePage({ searchParams }: StorePageProps) {
  const sp = await searchParams
  const query = parseQueryFromSearchParams(sp)
  const result = await getDiscoveryProducts(query)

  const inFitMode = !!query.vehicleConstraint?.length

  return (
    <DiscoveryTemplate result={result} currentPage={query.page} fit={inFitMode} />
  )
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `cd storefront && npx tsc --noEmit` → no new errors in the four touched files.

```bash
git add storefront/src/modules/discovery/components/grid/product-card.tsx \
  storefront/src/modules/discovery/components/grid/index.tsx \
  storefront/src/modules/discovery/templates/index.tsx \
  "storefront/src/app/[countryCode]/(main)/store/page.tsx"
git commit -m "$(cat <<'EOF'
feat(discovery): carry ?fit=1 to the PDP from fit-mode results

Only the discovery grid in fit mode (query.vehicleConstraint present) links to the
PDP with ?fit=1. The shared card's other users (PDP related, home rail) default to
no flag, so the PDP filters to the active vehicle only for genuine fitment entries.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fitment-aware hero + FitBanner (warning dialog)

**Files:**
- Create: `storefront/src/modules/product-detail/components/hero/fit-banner.tsx`
- Modify: `storefront/src/modules/product-detail/components/hero/index.tsx`

**Interfaces:**
- Consumes: `buildFitView` (Task 1); `useGarage` from `@lib/garage/use-garage`; `useSearchParams` from `next/navigation`; shadcn `Dialog` from `@/components/ui/dialog`.
- Produces: `<FitBanner filtered vehicleLabel onShowAll onOnlyFit />`.

- [ ] **Step 1: Write the FitBanner (banner + warning dialog)**

```tsx
// storefront/src/modules/product-detail/components/hero/fit-banner.tsx
"use client"

import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type FitBannerProps = {
  /** true = currently showing only fitting options; false = showing everything. */
  filtered: boolean
  vehicleLabel: string
  onShowAll: () => void
  onOnlyFit: () => void
}

/**
 * The fit-mode banner above the variant picker. When filtered, offers "Show all"
 * behind a one-time confirmation that the extra options may not fit. When showing
 * all, offers "Only show what fits". The acknowledgement is per-PDP-visit.
 */
const FitBanner = ({ filtered, vehicleLabel, onShowAll, onOnlyFit }: FitBannerProps) => {
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)

  const requestShowAll = () => (ack ? onShowAll() : setOpen(true))
  const confirm = () => {
    setAck(true)
    setOpen(false)
    onShowAll()
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-[var(--radius)] border px-4 py-3 text-[13px]"
      style={{ borderColor: "var(--hairline)", background: "rgba(255,106,0,0.04)" }}
    >
      <span className="text-[var(--ink)]">
        {filtered
          ? `Showing sizes & colors that fit your ${vehicleLabel}`
          : `Showing all sizes & colors — some may not fit your ${vehicleLabel}`}
      </span>
      {filtered ? (
        <button type="button" onClick={requestShowAll}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] text-[var(--orange)] underline">
          Show all
        </button>
      ) : (
        <button type="button" onClick={onOnlyFit}
          className="shrink-0 font-semibold uppercase tracking-[0.06em] text-[11px] text-[var(--orange)] underline">
          Only show what fits
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>These sizes may not fit your {vehicleLabel}.</DialogTitle>
            <DialogDescription>
              Showing all sizes and colors includes fitments outside your vehicle&apos;s spec. You can
              still order, but double-check fit before you buy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirm}>Show all anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default FitBanner
```

- [ ] **Step 2: Wire fit mode into the hero — imports + derived state**

In `storefront/src/modules/product-detail/components/hero/index.tsx`, add imports at the top (after the existing imports):

```tsx
import { useSearchParams } from "next/navigation"
import { useGarage } from "@lib/garage/use-garage"
import { buildFitView } from "../../data/fit-view"
import FitBanner from "./fit-banner"
```

Immediately inside `const Hero = ({ product }: HeroProps) => {`, before the existing `const finishOptions = product.finishOptions` line, insert:

```tsx
  const searchParams = useSearchParams()
  const { active } = useGarage()
  const fitParam = searchParams.get("fit") === "1"

  const fitView = useMemo(
    () => (fitParam && active ? buildFitView(product, active) : null),
    [fitParam, active, product]
  )
  const fitActive = !!fitView?.hasFit

  // In fit mode the picker shows only fitting options until the shopper opts into
  // "Show all" (which is gated by FitBanner's confirmation dialog).
  const [showAll, setShowAll] = useState(false)
  const useFilter = fitActive && !showAll
```

Then change the existing `const finishOptions = product.finishOptions` line to select the filtered set:

```tsx
  const finishOptions = useFilter ? fitView!.finishOptions : product.finishOptions
```

- [ ] **Step 3: Filter bolt patterns + add re-snap for finish and pattern**

Still in `index.tsx`, replace the existing `selectedBoltPattern` initializer line
`const [selectedBoltPattern, setSelectedBoltPattern] = useState<string>(product.boltPatternOptions[0] ?? product.boltPattern)`
with a filtered option list plus the same initializer:

```tsx
  const boltPatternOptions = useFilter ? fitView!.boltPatterns : product.boltPatternOptions

  const [selectedBoltPattern, setSelectedBoltPattern] = useState<string>(
    boltPatternOptions[0] ?? product.boltPattern
  )

  // Re-snap the finish when the visible finish set changes (fit mode toggling on
  // after the garage hydrates, or "Show all" flipping) so the selected finish is
  // always one that's actually shown — and a fitting one when filtering.
  useEffect(() => {
    if (!finishOptions.some((f) => f.raw === activeFinishRaw)) {
      setActiveFinishRaw(finishOptions[0]?.raw ?? "—")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishOptions])

  // Re-snap the bolt pattern the same way.
  useEffect(() => {
    if (boltPatternOptions.length && !boltPatternOptions.includes(selectedBoltPattern)) {
      setSelectedBoltPattern(boltPatternOptions[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boltPatternOptions])
```

Note: `activeFinishRaw`/`setActiveFinishRaw` already exist above; these effects reference them. Keep the existing `activeFinishRaw` initializer as-is (`finishOptions[0]?.raw ?? "—"`) — it now reads the possibly-filtered `finishOptions`, and the re-snap effect corrects it after garage hydration. The existing size re-snap (keyed on `visibleSizes`) already handles the size axis because `finishSizeOptions` derives from the filtered `activeFinish`.

- [ ] **Step 4: Pass the filtered bolt patterns to the picker + render the banner**

In the JSX, change the `VariantPicker`'s `boltPatterns` prop from `product.boltPatternOptions` to the derived `boltPatternOptions`:

```tsx
        <VariantPicker
          sizes={visibleSizes}
          selectedSize={selectedSize}
          onSizeChange={setSelectedSize}
          boltPatterns={boltPatternOptions}
          selectedBoltPattern={selectedBoltPattern}
          onBoltPatternChange={setSelectedBoltPattern}
        />
```

And render `<FitBanner>` at the top of the right-hand column (just inside `<div className="flex flex-col gap-8">`, before `<PurchasePanel …>`), only when fit mode is active:

```tsx
      <div className="flex flex-col gap-8">
        {fitActive && active && (
          <FitBanner
            filtered={useFilter}
            vehicleLabel={`${active.year} ${active.make} ${active.model}`}
            onShowAll={() => setShowAll(true)}
            onOnlyFit={() => setShowAll(false)}
          />
        )}
        <PurchasePanel
```

- [ ] **Step 5: Typecheck + run the full storefront suite**

Run: `cd storefront && npx tsc --noEmit`
Expected: no NEW errors in `hero/index.tsx` or `fit-banner.tsx` (baseline errors unchanged).
Run: `cd storefront && npx vitest run`
Expected: PASS (all existing + Task 1's 5 new fit-view tests). The hero/banner interaction has no unit test (no React test runner in this repo — consistent with the rest of the PDP); it's gated by tsc + the existing render.

- [ ] **Step 6: Commit**

```bash
git add storefront/src/modules/product-detail/components/hero/fit-banner.tsx \
  storefront/src/modules/product-detail/components/hero/index.tsx
git commit -m "$(cat <<'EOF'
feat(pdp): fitment-aware hero — filter options to the active vehicle (?fit=1)

When the shopper arrives via ?fit=1 with an active vehicle that has wheel-size
windows, the hero shows only fitting bolt patterns / sizes / colors and re-snaps
the selection to a fitting variant. A FitBanner offers "Show all" behind a
confirmation that the extra options may not fit; the fit chip stays live. Full
catalog / no-vehicle / no-window visitors are unaffected.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Trigger via `?fit=1` link flag (only with active vehicle + windows) → Task 2 (flag) + Task 3 (read + gate on `fitView.hasFit`). ✓
- Pure `buildFitView` computing fitting bolt/size/**color** subsets, `hasFit:false` fallback → Task 1. ✓
- Hero filters + defaults to fitting (via re-snap to first fitting option) → Task 3. ✓ (spec's `defaults` object folded into re-snap — noted above, same behavior.)
- Finishes with no fitting variant dropped; kept finishes' sizes trimmed → Task 1 `buildFitView`, consumed by hero + gallery (gallery already renders whatever `finishOptions` it's passed — no gallery change needed). ✓
- "Show all" escape gated by a confirmation dialog, one-time ack, "Only show what fits" to collapse → Task 3 `FitBanner`. ✓
- Storefront-only, no backend → all tasks. ✓

**Placeholder scan:** no TBD/TODO; every step has concrete code or an exact command + expected output.

**Type consistency:** `FitView = { hasFit, boltPatterns, finishOptions }` defined in Task 1, consumed with those exact fields in Task 3. `FitVehicle` fields match the garage `Vehicle` (`canonicalBoltPatterns`/`hubBoreMm`/`*Window`). `fit?: boolean` prop consistent across card/grid/template/page (Task 2).

**Sequencing:** Task 1 (pure) → Task 3 (consumes it). Task 2 is independent (can run before or after). Task 3 depends on Task 1.
