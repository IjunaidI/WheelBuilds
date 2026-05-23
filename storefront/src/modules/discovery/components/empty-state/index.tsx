"use client"

import Wheel from "@modules/common/components/wheel"
import Display from "@modules/common/components/display"
import Label from "@modules/common/components/label"
import { Button } from "@/components/ui/button"
import { useDiscoveryQuery } from "../../data/use-discovery-query"

/**
 * Rendered when the current filter combination returns 0 results. Offers a
 * single recovery action: clear all filters.
 */
const DiscoveryEmpty = () => {
  const { clearAll } = useDiscoveryQuery()

  return (
    <div className="flex flex-col items-center text-center py-24 gap-4 border border-dashed border-[var(--hairline)] rounded-[var(--radius)]">
      <div style={{ opacity: 0.4 }}>
        <Wheel size={140} finish="black" />
      </div>
      <Label tone="muted">NO MATCHES</Label>
      <Display size={28} as="h2">
        No wheels match these filters.
      </Display>
      <p className="text-[14px] text-[var(--graphite)] max-w-[400px]">
        Try widening your selection — maybe drop the diameter or finish
        constraint, or clear everything and start over.
      </p>
      <Button onClick={clearAll} className="mt-2">
        Clear all filters
      </Button>
    </div>
  )
}

export default DiscoveryEmpty
