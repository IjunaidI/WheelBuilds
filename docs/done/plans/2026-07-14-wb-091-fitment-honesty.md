# WB-091 Fitment Honesty — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Storefront + tiny backend read. Spec: [../specs/2026-07-14-wb-091-fitment-honesty-design.md](../specs/2026-07-14-wb-091-fitment-honesty-design.md).

**Global constraints:** WB primitives. Storefront tests `npx vitest run <path>` (import `{describe,it,expect}`; 5-error tsc baseline); backend `pnpm test:sync`. Wheels already have `FitTier` (fits/check/no-fit/unknown) + unknown-aware `fitsVehicle` + year/trim highlight — port those to tires + ground copy. **Coordinates with WB-104** in `reverse-fitment.ts` + `fitment/index.tsx` (orthogonal: P5=product-side bore, WB-104=vehicle-side trim — keep the seam clean). Branch `feat/g11-wave2-pdp-fitment`.

---

### Task 1: P3 — tire three-state verdict + unknown band/chip
**Files:** `lib/fitment/tire-fits-vehicle.ts` (new `tireFitVerdict`), `components/tire/fitment.tsx` (band), `components/tire/hero/purchase-panel.tsx` (chip). Test: `tire-fits-vehicle.test.ts`.
- [ ] Failing test: `tireFitVerdict(specs, oemTires)` → `"unknown"` when `oemTires` empty, `"fits"` when a spec matches, `"no"` otherwise (three-state golden). `tireFitsVehicle` (boolean) stays.
- [ ] RED → implement `tireFitVerdict(productSpecs, vehicleOemTires): "fits"|"no"|"unknown"` (unknown when `!vehicleOemTires?.length`; else fits/no via the existing `fits` logic). `tire/fitment.tsx`: derive the band from the verdict — `unknown` renders "We don't have factory tire data for your {year} {make} {model} yet — check your door placard" (neutral border/copy, NOT "runs a different factory tire size"). `tire/hero/purchase-panel.tsx`: the chip renders a NEUTRAL state on `unknown` (not "MAY NOT FIT").
- [ ] GREEN vitest; `tsc`.
- [ ] Commit `fix(WB-091): tire three-state fit verdict — unknown ≠ mismatch (P3)`.

---

### Task 2: P4/P5 — wheel chip unknown + band subtext from fitView
**Files:** `components/hero/purchase-panel.tsx` (chip unknown branch), `components/fitment/index.tsx` (band subtext from fitView), `data/get-product.ts` + `backend/src/modules/wheel-size/reverse-fitment.ts` (per-size bore instead of variants[0]). Test: chip/band matrix.
- [ ] Failing test: the wheel purchase-panel chip has an `unknown` branch (neutral) matching the band's unknown, for a product with no canonical patterns / a vehicle with no pattern data; the "fits"-tier band subtext derives from `buildFitView` not `fitsVehicle().withinWindow`.
- [ ] RED → implement: the chip gains the `unknown` branch (mirror the band's unknown copy — currently 3-branch `fits/check/else→DOESN'T FIT`; add `unknown` when `variantFitTier` would be "no" only because the vehicle/product has no pattern data). The fits-tier subtext in `fitment/index.tsx:121-125` reads the per-variant `buildFitView` result (withinWindow-per-variant) instead of the product-level `verdict.withinWindow`. Reverse-fitment: pass the per-size bore set / most-permissive bore into `getFitmentByProduct` (`get-product.ts:134-138`) + the backend `matchedPattern` bore, instead of the single `variants[0]` `centerBoreMm`. **Do NOT touch `extractVehicleIdentity` (WB-104 owns it) — only the bore-matching path.**
- [ ] GREEN vitest; backend `pnpm test:sync`; `tsc`.
- [ ] Commit `fix(WB-091): wheel chip unknown state + band subtext from per-variant fitView + per-size reverse bore (P4/P5)`.

---

### Task 3: P6 — ground fabricated claims / dead links
**Files:** `components/fitment/index.tsx` (offset-at-review), `data/pdp-config.ts` (Fitment guarantee), `components/tire/fitment.tsx` (Submit-your-vehicle), `components/hero/advanced-fitment-panel.tsx` (What-is-offset + fully-cleared/Pros-approved), `modules/policies/content.ts`/`returns` (fitment anchor). No unit test (copy/link) — grep + build.
- [ ] Implement: remove "we'll verify final offset at order review" (`fitment/index.tsx:124`); the "Fitment guarantee" trust-strip item links the real `/returns` fitment section (add an anchor id on that section) AND soften "Or money back" → the actual conditional-refund wording; tire "Submit your vehicle" `href="#"` → `/contact`; "What is offset?" `href="#"` → the in-page advanced-panel diagram anchor; soften "fully cleared"/"Pros approved" to honest default-ET copy (WB-062 tone). Grep-verify NO `href="#"` remains in `product-detail` fitment/hero components.
- [ ] Verify `npx tsc --noEmit` + grep. Commit `fix(WB-091): ground fabricated fitment claims + dead links (P6)`.

---

### Task 4: P13/P14 — tire YOUR-VEHICLE matching + wheel disclosure
**Files:** `components/tire/fitment.tsx` (year/trim match — port from `components/fitment/index.tsx:184-206`), `components/fitment/index.tsx` (non-exhaustive disclosure + hide-0-count). Test: year/trim match port.
- [ ] Failing test: the tire highlight matches on year-range + trim (not make+model only) — port `yearMatches`/`trimMatches`.
- [ ] RED → implement: port the wheel `yearMatches` (range-aware) + `trimMatches` into `tire/fitment.tsx:140-143`. In wheel `fitment/index.tsx`: add the "non-exhaustive — check your placard" sentence to the description; hide the "N CONFIRMED MODELS" count when 0 (or reword so 0 ≠ "fits nothing"); add a "Check YOUR vehicle" CTA opening the search drawer.
- [ ] GREEN vitest; `tsc`. Commit `fix(WB-091): tire year/trim YOUR-VEHICLE match + wheel non-exhaustive disclosure (P13/P14)`.

---

### Task 5: N4/N5/N7 — resolve-failure recovery
**Files:** `lib/garage/vehicle-data.ts` (YEARS→2027), `search/.../find-by-vehicle/ymm-pane.tsx` (slugify seed values + honest toasts) + `find-by-vehicle/index.tsx` (Re-check fit action), `home/components/hero/index.tsx` (honest CTA). Test: slugify + years.
- [ ] Failing test: `YEARS` includes 2026 + 2027; a best-effort `slugifyYmm(value)` (lowercase, non-alnum→`-`) used before live lookups when falling back to seed.
- [ ] RED → implement: extend `YEARS` (currently `2025-i` ×11) through 2027; when the live catalog is unavailable and seed values are used, `slugifyYmm` the chosen value before the API call. The current-vehicle row in `find-by-vehicle/index.tsx` gains a **"Re-check fit"** button (calls `resolveFitmentForVehicle` + `garage.update()` — reuse the `ymm-pane` `update()` shape; `garage-pane.tsx`'s orphaned `needsResolve` is a reference) shown when the active vehicle has no windows (`!canonicalBoltPatterns?.length`). The `unavailable`/`failed` toasts keep the drawer open with honest "temporarily down — try again" copy (drop "contact support"; don't route to the unfiltered `/store` as if filtered). Home hero CTA copy honest when the active vehicle has no patterns.
- [ ] GREEN vitest; `tsc`; `npx next build` compiles. Commit `fix(WB-091): YMM seed slugs+years, Re-check fit recovery, honest resolve-failure copy (N4/N5/N7)`.
