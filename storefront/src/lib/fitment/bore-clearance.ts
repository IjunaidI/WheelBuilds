// Twin of backend/src/modules/wheel-size/bore-clearance.ts (WB-077 F4).
// Golden-guarded lockstep via fixtures/bore-clearance-golden.json.
// Gaps up to 0.2mm between the vendor feed and wheel-size.com are inside both
// sources' rounding error — treat as clearing.
export const BORE_TOLERANCE_MM = 0.2

export function boreClears(bore: number | null, hub: number | null): boolean {
  return bore == null || hub == null || bore >= hub - BORE_TOLERANCE_MM
}
