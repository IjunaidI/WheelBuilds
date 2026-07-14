# WB-091 · Fitment honesty completion — design

> G11 Wave 2 (runs with WB-104 — adjacent reverse-fitment files, kept as separate commits).
> Findings **P3, P4, P5, P6, P13, P14, N4, N5, N7** ([audit §P/§N](../../future/plans/2026-07-13-ux-completeness-audit.md)).
> Re-verified against current `main` (`05ed651`) 2026-07-14 — evidence inline. Storefront + tiny backend read.

## Problem
Tire fitment collapses "no OEM data" into "runs a different size" (a false mismatch); the wheel purchase chip says "DOESN'T FIT" where the band below it says "unknown"; band subtext still branches on a product-level (variants[0]-bore) verdict; several fabricated claims + dead links; the tire "YOUR VEHICLE" highlight matches make+model only; the wheel "N CONFIRMED MODELS" list has no non-exhaustive disclosure ("0 CONFIRMED MODELS" reads as "fits nothing"); and a vehicle saved during a failed fitment resolve stays window-less with no retry.

**Reference:** wheels already have the three/four-tier `FitTier` (`fits/check/no-fit/unknown`) + an unknown-aware `fitsVehicle` verdict + year/trim highlight matching — most of WB-091 is porting those patterns to tires + grounding copy.

## Decisions (defaults; the consequential one flagged)
- **P3 tire verdict = three-state** (`fits/no/unknown`), NOT four — tires have no "aggressive/check" concept. New `tireFitVerdict(specs, oemTires): "fits"|"no"|"unknown"` (unknown when the vehicle has no OEM tire data); `tireFitsVehicle` (boolean) stays for callers that only need yes/no.
- **N4 (stale YMM seed) = minimal + honest, defer a full catalog snapshot.** Extend `YEARS` through 2027; keep `vehicle-data.ts` as a *display* fallback; when the live catalog is unavailable and the seed is used, **best-effort slugify the chosen value before the API call** AND if the resolve fails, show the honest **unknown/degraded** state (N5/N7) rather than silently sending a probably-wrong display name. A one-time live-catalog-slug snapshot script is a tracked follow-up (no source/script exists today).
- **P6 "Fitment guarantee":** link the trust-strip item to a real "Fitment-related returns" anchor on `/returns` AND soften the "Or money back" sub-copy to match the actual (conditional) policy — same shared `TRUST_STRIP` on both panels.

## Design (storefront + a tiny backend read)
1. **Tire unknown tier (P3).** `tireFitVerdict` three-state; `tire/fitment.tsx` renders the unknown band ("We don't have factory tire data for your <vehicle> yet — check your door placard") + a **neutral** chip (not "MAY NOT FIT") when the vehicle has no `oemTires`. Border/copy stop conflating `null` (no data) with `false` (mismatch).
2. **Wheel chip unknown (P4).** The purchase-panel chip gains the `unknown` branch (neutral copy) so it agrees with the band — currently 3-branch (`fits/check/else→DOESN'T FIT`); add `unknown` when the product has no canonical patterns OR the vehicle has no pattern data (the band already distinguishes this).
3. **Band subtext from fitView (P5).** Derive the fits-tier subtext from the per-variant `buildFitView` result, not the product-level `fitsVehicle().withinWindow` (variants[0]-bore). The reverse-fitment query passes the **per-size bore set / most-permissive bore** instead of the single `variants[0]` bore. *(Coordinates with WB-104 in the same `reverse-fitment.ts`/`fitment/index.tsx` — orthogonal: P5 is product-side single-bore, WB-104 is vehicle-side single-trim; keep the seam clean.)*
4. **Tire YOUR-VEHICLE row (P13).** Port the wheel list's `yearMatches` (range-aware) + `trimMatches` to `tire/fitment.tsx` (currently make+model only).
5. **Reverse-fitment disclosure (P14).** The wheel `fitment/index.tsx` description gains the tire section's "non-exhaustive — check your placard" sentence; hide the "N CONFIRMED MODELS" count when 0 (or reword so 0 doesn't read as "fits nothing"); add a "Check YOUR vehicle" CTA opening the drawer.
6. **Grounded claims (P6).** Remove "we'll verify final offset at order review"; the "Fitment guarantee" chip links the real `/returns` fitment anchor + softened sub-copy; tire "Submit your vehicle" `href="#"` → `/contact`; "What is offset?" `href="#"` → the in-page advanced-panel diagram anchor; soften "fully cleared"/"Pros approved" to the WB-062-honest default-ET copy.
7. **Resolve-failure recovery (N4/N5/N7).** Extend `YEARS` through 2027; best-effort slugify seed values before live lookups; the current-vehicle row in `find-by-vehicle/index.tsx` gains a **"Re-check fit"** action (calls `resolveFitmentForVehicle` + `garage.update()` — reuse the `ymm-pane` `update()` shape; the orphaned `garage-pane.tsx` `needsResolve` logic is a reference) shown when the active vehicle lacks windows; the `unavailable`/`failed` toasts keep the drawer open with honest "temporarily down — try again" copy (stop implying support can fix it, stop routing to the *unfiltered* catalog as if it were filtered); the home hero CTA copy is honest when the active vehicle has no patterns.

## Verify
Vitest: `tireFitVerdict` three-state golden (fits/no/unknown); chip↔band agreement matrix (fits/check/no/unknown × wheel/tire); tire year/trim match port; the honest-copy strings present + no `href="#"` in fitment components. Live: a vehicle without OEM tire data shows the unknown band (not "runs a different size"); a wheel with no canonical patterns shows a neutral chip agreeing with the band.

## Deploy
Storefront rebuild. (`vehicle-data.ts` extension + slugify are code; no backend re-sync.)

## Out of scope
Per-trim verdict windows (WB-077 trade-off); staggered fitment (WB-102); a full live-catalog YMM snapshot script (tracked follow-up); the confirmed-list identity fix (WB-104 owns it).
