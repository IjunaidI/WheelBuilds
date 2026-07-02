"use client"

import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { useTireQuery } from "../../use-tire-query"

/**
 * Rendered when the current filter combination returns 0 results. Unlike
 * modules/discovery/components/empty-state, there is no fitment-driven
 * branch here — tires have no vehicle-fit constraint to turn off — so this
 * is always the single generic "no matches" copy + a clear-all recovery.
 */
const TireEmpty = () => {
  const { clearAll } = useTireQuery()

  return (
    <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
      <div
        aria-hidden
        style={{ opacity: 0.4 }}
        className="h-[140px] w-[140px] rounded-full border-[10px] border-[var(--hairline)] bg-[var(--ink)]/[0.04]"
      />
      <Label tone="muted">NO MATCHES</Label>
      <Display size={28} as="h2">
        No tires match these filters.
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[400px]">
        Try widening your selection — maybe drop the size or rim diameter
        constraint, or clear everything and start over.
      </p>
      <Button onClick={clearAll} className="mt-2">
        Clear all filters
      </Button>
    </div>
  )
}

export default TireEmpty
