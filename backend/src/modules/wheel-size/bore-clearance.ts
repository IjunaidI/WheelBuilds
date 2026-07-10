// Shared bore-clearance tolerance (WB-077 F4). Gaps up to 0.2mm between the vendor
// feed and wheel-size.com are inside both sources' rounding error — treat as clearing.
// Unknown (either side null) passes: the axis is uncheckable, not disproven.
// Twin: storefront/src/lib/fitment/bore-clearance.ts — golden-guarded lockstep.
export const BORE_TOLERANCE_MM = 0.2

export function boreClears(bore: number | null, hub: number | null): boolean {
  return bore == null || hub == null || bore >= hub - BORE_TOLERANCE_MM
}
