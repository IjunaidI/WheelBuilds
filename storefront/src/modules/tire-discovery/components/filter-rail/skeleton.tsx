import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton for the Tire Discovery FilterRail. Seven collapsed accordion
 * sections (Brand / Rim diameter / Size / Tire type / Speed rating / Load
 * rating / Price), matching the closed state of the real rail. There is no
 * Vehicle band here — tires have no fitment constraint (see
 * filter-sections.tsx).
 */
const TireFilterRailSkeleton = () => (
  <aside className="hidden small:block w-[260px] shrink-0 sticky top-4 self-start">
    {/* Seven accordion sections, all closed */}
    <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white px-4 divide-y divide-[var(--hairline)]">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-3 rounded-full" />
        </div>
      ))}
    </div>
  </aside>
)

export default TireFilterRailSkeleton
