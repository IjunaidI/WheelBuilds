/**
 * WB-115 premerge review round 2 (Important 1): resolve a vendor's image
 * dead-ratio circuit-breaker threshold with a three-level fallback --
 * per-vendor env wins, then the global env, then the hardcoded per-vendor
 * default -- so the documented emergency knob (VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO,
 * or its new per-vendor siblings) actually has an effect.
 *
 * Before this fix, `medusa-config.js` hardcoded `maxDeadRatio` directly on
 * each `vendors.<code>` entry (0.40 for wheels, 0.70 for tires), so setting
 * `VENDOR_SYNC_IMAGE_DEAD_MAX_RATIO` in Railway had NO effect on either live
 * vendor -- an operator trying to unblock a tripped run mid-incident would
 * set it, see nothing change, and escalate to the `VENDOR_SYNC_IMAGE_CHECK_ENABLED=false`
 * kill switch instead of the narrower knob meant for exactly this case.
 *
 * A malformed value (non-numeric, blank) is NOT specially handled here --
 * `parseFloat("garbage")` produces `NaN`, which is caught downstream by
 * `pipeline/stage.ts`'s existing `Number.isFinite(maxDeadRatio)` guard
 * (falls back to stage.ts's own default and warns). That guard already
 * applies to the returned value regardless of which of the three sources
 * produced it, so this function only needs to implement the fallback CHAIN,
 * not re-implement the numeric guard.
 */
export function resolveVendorMaxDeadRatio(
  perVendorRaw: string | undefined,
  globalRaw: string | undefined,
  hardcodedDefault: number
): number {
  const raw = perVendorRaw ?? globalRaw
  return raw === undefined ? hardcodedDefault : parseFloat(raw)
}
