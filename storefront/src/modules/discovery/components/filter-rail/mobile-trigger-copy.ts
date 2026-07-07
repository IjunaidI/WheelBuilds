// storefront/src/modules/discovery/components/filter-rail/mobile-trigger-copy.ts
//
// Pure label builders for MobileFilterTrigger (WB-074 D2 review). Split out
// from the component so the honest-cap branch is unit-testable without a
// React render harness (this repo has no RTL/jsdom component-test infra —
// see get-products.cap.test.ts for the same pure-function pattern).
//
// `MobileFilterTrigger` renders on the same screen as `DiscoveryHeader` on
// viewports under `small`. Before this fix, the trigger showed the raw
// (possibly wrong) `totalCount` — e.g. "200 results" directly under the
// header's honest "TOP 200 CANDIDATES — REFINE TO NARROW" — a live
// contradiction on one screen. Both now share the same "candidates" wording
// when `isCapped`, sourced from the same `FIT_CANDIDATE_CAP` constant.
import { FIT_CANDIDATE_CAP } from "../../data/types"

/** Button label (right side of the mobile "Filters" trigger). */
export function mobileTriggerLabel(totalCount: number, isCapped: boolean): string {
  if (isCapped) return `Top ${FIT_CANDIDATE_CAP.toLocaleString()} candidates`
  return `${totalCount} ${totalCount === 1 ? "result" : "results"}`
}

/** Drawer CTA button label ("View ..."). */
export function mobileDrawerCta(totalCount: number, isCapped: boolean): string {
  if (isCapped) return `View top ${FIT_CANDIDATE_CAP.toLocaleString()} candidates`
  return `View ${totalCount} ${totalCount === 1 ? "result" : "results"}`
}
