import FilterRailSkeleton from "../components/filter-rail/skeleton"
import DiscoveryGridSkeleton from "../components/grid/skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Full-page Discovery skeleton. Wired into `/store/loading.tsx` for the
 * route-level fallback Next.js renders during navigation. Matches the
 * shape of `<DiscoveryTemplate>` so the layout doesn't shift on swap.
 */
const DiscoveryTemplateSkeleton = () => (
  <section className="px-5 pt-6 pb-16 xsmall:px-8 small:px-20 small:pt-8 small:pb-20">
    {/* Header */}
    <div className="flex flex-col small:flex-row small:items-end small:justify-between gap-4 pb-6 border-b border-[var(--hairline)] mb-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="h-9 w-44 small:h-12 small:w-56" />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Skeleton className="h-7 w-44 rounded-full" />
        <Skeleton className="h-8 w-28 small:w-48" />
      </div>
    </div>

    {/* Mobile filter trigger placeholder */}
    <Skeleton className="small:hidden h-10 w-full mb-4" />

    {/* Rail + grid */}
    <div className="flex items-start gap-8">
      <FilterRailSkeleton />
      <div className="flex-1 min-w-0">
        <DiscoveryGridSkeleton />
      </div>
    </div>
  </section>
)

export default DiscoveryTemplateSkeleton
