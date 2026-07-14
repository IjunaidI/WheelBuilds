"use client"

import { useRouter } from "next/navigation"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"

/**
 * Rendered instead of <TireEmpty> when `result.ok === false` (WB-088 D6) —
 * i.e. the Meilisearch query itself failed (see get-tire-products.ts's outer
 * catch), NOT a genuine 0-match filter combination. Mirrors the wheel
 * `DiscoveryOutage`. Distinguishing the two matters: telling a shopper "no
 * tires match these filters" during an outage wrongly blames their filter
 * choices for an infra problem instead of being honest that the catalog
 * couldn't be reached.
 *
 * Retry calls `router.refresh()` to re-run the server component tree (and
 * thus `getTireDiscoveryProducts`) in place, without a full page reload — if
 * the outage has cleared, the next request naturally self-heals since the
 * failure is never cached (see get-tire-products.ts's `outageResult`).
 */
const TireOutage = () => {
  const router = useRouter()

  return (
    <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
      <div
        aria-hidden
        style={{ opacity: 0.4 }}
        className="h-[140px] w-[140px] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
      />
      <Label tone="muted">CATALOG UNAVAILABLE</Label>
      <Display size={28} as="h2">
        Catalog temporarily unavailable
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[420px]">
        We&apos;re having trouble reaching the catalog right now — this
        isn&apos;t about your filters. Please try again in a moment.
      </p>
      <Button onClick={() => router.refresh()} className="mt-2">
        Retry
      </Button>
    </div>
  )
}

export default TireOutage
