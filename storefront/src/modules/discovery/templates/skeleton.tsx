import FilterRailSkeleton from "../components/filter-rail/skeleton"
import DiscoveryGridSkeleton from "../components/grid/skeleton"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Full-page Discovery skeleton. Wired into `/store/loading.tsx` for the
 * route-level fallback Next.js renders during navigation. Matches the
 * shape of `<DiscoveryTemplate>` so the layout doesn't shift on swap.
 */
const DiscoveryTemplateSkeleton = () => (
  <section style={{ padding: "32px 80px 80px" }}>
    {/* Header */}
    <div className="flex items-end justify-between gap-4 flex-wrap pb-6 border-b border-[var(--hairline)] mb-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-2.5 w-32" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-44 rounded-full" />
        <Skeleton className="h-8 w-48" />
      </div>
    </div>

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
