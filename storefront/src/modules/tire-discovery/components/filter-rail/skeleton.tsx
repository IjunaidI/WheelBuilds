import { Skeleton } from "@/components/ui/skeleton"

/**
 * Skeleton for the Tire Discovery FilterRail. The Vehicle band + seven
 * collapsed accordion sections (Brand / Rim diameter / Size / Tire type /
 * Speed rating / Load rating / Price), matching the closed state of the real
 * rail (see filter-sections.tsx).
 */
const TireFilterRailSkeleton = () => (
  <aside className="hidden small:block w-[260px] shrink-0 sticky top-4 self-start">
    {/* Vehicle band */}
    <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white p-4 mb-4 flex flex-col gap-2">
      <Skeleton className="h-2.5 w-16" />
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-3.5 flex-1" />
      </div>
    </div>

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
