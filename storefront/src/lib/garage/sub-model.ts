/**
 * WB-113: the marketing sub-model axis (L / LE / LE Eco / …) that replaced
 * the engine "modification" (1.8i / 1.8 VVT-i) as the YMM picker's 4th axis.
 *
 * `Vehicle.modificationSlug` (types.ts) is deliberately NOT renamed — it
 * still mirrors the backend's own `VehicleFitment.source.modificationSlug`
 * key (unchanged by Task 3's route work), keeping the field name identical
 * end-to-end. What changed is what it HOLDS: as of this feature it's the
 * picked SUB-MODEL STRING ("LE", "Base"), not a wheel-size
 * engine-modification hash slug ("32b586f1cd").
 */
export const BASE_SUB_MODEL = "Base"

// wheel-size modification slugs are opaque lowercase-hex hashes, e.g.
// "32b586f1cd" / "7a1c9e0f42" (docs/done/specs/2026-05-30-wheel-size-task1-findings.md
// §5; also the fixture in find-by-vehicle/__tests__/to-options.test.ts).
// Every real sub-model string this feature deals with — the live wheel-size
// `trim_levels` union (L, LE, LE Eco, XLE, SE, XSE, …) AND the offline
// `TRIMS_BY_MODEL` marketing-trim seed (XL, XLT, Lariat, Trail Boss, ZR2,
// 1500, …) — contains at least one character outside `0-9a-f`, so this
// pattern reliably tells the two apart without needing the vehicle's live
// known-sub-model list (which isn't available synchronously anyway — it's
// a separate network fetch keyed by make/model/year).
const LEGACY_MODIFICATION_SLUG = /^[0-9a-f]{8,}$/

/**
 * Normalizes a Vehicle's stored `modificationSlug` before it's re-sent as
 * `sub_model` — used by the "Re-check fit" retry (find-by-vehicle/index.tsx)
 * and the mothballed garage-pane's re-select path. A vehicle saved BEFORE
 * WB-113 stored an engine-modification slug in this field; passing that
 * straight through would silently mean nothing today. Rather than let a
 * meaningless value drift through as if it were a real pick, this collapses
 * it — and any other absent/blank/unrecognized value — to the `Base`
 * sentinel: resolve broad, never error, never masquerade as a real trim.
 *
 * (Defense in depth, not the only safety net: the backend's
 * `fitmentForSubModel` already falls back to all-entries when a sub-model
 * matches nothing — backend/src/modules/wheel-size/service.ts — so a stale
 * slug reaching the network wouldn't error there either. This normalizer
 * keeps that same honesty on the storefront side too, before the request is
 * even sent, and keeps a stale value from rendering as if it were a real
 * trim anywhere in the UI.)
 */
export function normalizeStoredSubModel(value: string | null | undefined): string {
  if (!value) return BASE_SUB_MODEL
  if (LEGACY_MODIFICATION_SLUG.test(value)) return BASE_SUB_MODEL
  return value
}
