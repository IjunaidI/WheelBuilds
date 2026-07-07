// storefront/src/modules/discovery/components/fitment-sync/strip-fit.ts

/**
 * The URL params FitmentSync owns: `fit` (bolt patterns) plus the bore/
 * diameter/width/offset windows that ride alongside it. Shared between the
 * sync-down write path (index.tsx's `desired` object) and the orphan-strip
 * decision below so the two param sets can't drift apart.
 */
export const FIT_PARAM_KEYS = ["fit", "fitb", "fitd", "fitw", "fito"] as const

export type ShouldStripFitArgs = {
  /**
   * The garage load has genuinely settled — see use-garage.ts's `isLoaded`
   * (WB-073 Task 5/G6). False for the entire span of an in-flight authed
   * load, when "no active vehicle yet" is indistinguishable from "genuinely
   * no vehicles" — the exact ambiguity that made this strip unsafe to do at
   * all before that signal existed.
   */
  isLoaded: boolean
  /**
   * There's an active vehicle with usable bolt-pattern data — i.e.
   * FitmentSync's own `desiredFit` is non-null. False covers BOTH "no
   * active vehicle" (deleted / never picked) and "active vehicle exists but
   * wheel-size has no bolt-pattern data for it" — both leave a `?fit` in the
   * URL that no longer maps to anything real.
   */
  hasActive: boolean
  /** Any of FIT_PARAM_KEYS is present in the current URL. */
  hasFitParam: boolean
  /** `fit=0` — the user's explicit "don't filter by fitment" choice. Always
   *  authoritative; never strip (there's nothing to strip: the sync-down
   *  path already refuses to write over it, and the URL only ever carries
   *  bare `fit=0` in that state — no `fitb/fitd/fitw/fito`). */
  isExplicitOptOut: boolean
}

/**
 * Decides whether FitmentSync should strip an orphaned fit param set from
 * the URL (WB-073 Task 9 / G10 — e.g. the active vehicle was just deleted,
 * the last one in the garage). Pure so the "never flicker during boot"
 * guarantee is unit-testable without mounting the component or faking a
 * router/searchParams.
 */
export function shouldStripFit({
  isLoaded,
  hasActive,
  hasFitParam,
  isExplicitOptOut,
}: ShouldStripFitArgs): boolean {
  if (isExplicitOptOut) return false
  if (!isLoaded) return false
  if (hasActive) return false
  return hasFitParam
}
