import { Skeleton } from "@/components/ui/skeleton"

/**
 * Full-page Home skeleton. Wired into `app/[countryCode]/(main)/loading.tsx`
 * for the route-level fallback Next.js renders on a slow hard load -- every
 * home section sits behind the same `getHomeCatalog()` server fetch, so
 * without this the whole page renders blank until it resolves.
 *
 * Doesn't replicate all 9 home sections pixel-for-pixel (same level of
 * fidelity `DiscoveryTemplateSkeleton` uses for `/store` -- a placeholder
 * shape, not a pixel match). Mirrors the hero (eyebrow + display headline +
 * subcopy + 4-tile vehicle selector + CTA row) plus two generic product-row
 * sections, matching the real sections' padding rhythm (`px-5 ...
 * small:px-20`) so nothing jumps when real data lands.
 */
const HomeTemplateSkeleton = () => (
  <>
    {/* Hero */}
    <section className="relative px-5 pt-12 pb-16 xsmall:px-8 small:px-20 small:pt-20 small:pb-24">
      <div className="relative z-10 max-w-[1280px]">
        <Skeleton className="h-2.5 w-40 mb-5 small:mb-7" />
        <Skeleton className="h-14 w-[85%] mb-3 small:h-28 small:w-[70%]" />
        <Skeleton className="h-14 w-[60%] mb-5 small:h-28 small:w-[50%]" />
        <Skeleton className="h-5 w-[80%] small:w-[45%] mt-5 mb-8 small:mt-7 small:mb-10" />

        {/* Mega vehicle selector placeholder */}
        <div className="grid grid-cols-2 small:grid-cols-4 gap-2 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] small:h-[110px]" />
          ))}
        </div>

        {/* CTA row */}
        <div className="flex gap-3 small:gap-3.5 items-stretch small:items-center">
          <Skeleton className="h-14 w-full small:w-64" />
          <Skeleton className="hidden small:block h-8 w-40" />
        </div>
      </div>
    </section>

    {/* Two generic product-row sections (New Arrivals / Shop by Style shape) */}
    {Array.from({ length: 2 }).map((_, row) => (
      <section
        key={row}
        className="px-5 pt-16 pb-12 xsmall:px-8 small:px-20 small:pt-20 small:pb-20"
      >
        <div className="flex flex-col small:flex-row small:items-end small:justify-between gap-4 mb-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-48 small:h-9 small:w-56" />
          </div>
          <Skeleton className="h-6 w-28 hidden small:block" />
        </div>
        <div className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </section>
    ))}
  </>
)

export default HomeTemplateSkeleton
