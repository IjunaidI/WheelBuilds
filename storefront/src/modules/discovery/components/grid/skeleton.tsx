import { Skeleton } from "@/components/ui/skeleton"
import { DEFAULT_PAGE_SIZE } from "../../data/types"

/**
 * Product grid skeleton — matches the shape of `<DiscoveryGrid>` so the
 * layout doesn't shift when real cards swap in. Used by `/store/loading.tsx`
 * and by any future Suspense boundary that wraps a server-side product fetch.
 */
const DiscoveryGridSkeleton = ({
  count = DEFAULT_PAGE_SIZE,
}: {
  count?: number
}) => (
  <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
    {Array.from({ length: count }).map((_, i) => (
      <li key={i}>
        <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white">
          <Skeleton className="aspect-square rounded-b-none" />
          <div className="p-3 flex flex-col gap-2">
            <Skeleton className="h-2.5 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex items-center gap-1.5 mt-1">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-2.5 w-24 ml-1" />
            </div>
            <div className="border-t border-[var(--hairline)] mt-2 pt-3 flex items-center justify-between">
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
      </li>
    ))}
  </ul>
)

export default DiscoveryGridSkeleton
