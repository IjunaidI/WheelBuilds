import { Skeleton } from "@/components/ui/skeleton"

/**
 * Full-page PDP skeleton. Used by `/products/[handle]/loading.tsx` and by
 * any Suspense boundary above the server-side product fetch when real data
 * wires up. Matches the shape of `<ProductDetailTemplate>`.
 */
const ProductDetailSkeleton = () => (
  <section
    style={{
      padding: "32px 80px 80px",
      maxWidth: 1600,
      margin: "0 auto",
    }}
  >
    {/* Breadcrumb */}
    <div className="flex items-center gap-2 mb-8">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-3 w-36" />
    </div>

    {/* Hero split */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: 64,
        alignItems: "start",
      }}
    >
      {/* Gallery */}
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-square rounded-[var(--radius)]" />
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-2">
          <Skeleton className="aspect-square flex-1 rounded-[var(--radius)]" />
          <Skeleton className="aspect-square flex-1 rounded-[var(--radius)]" />
          <Skeleton className="aspect-square flex-1 rounded-[var(--radius)]" />
        </div>
      </div>

      {/* Purchase panel + variant picker */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-14 w-3/4" />
          <div className="flex items-baseline gap-3 mt-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-10 w-28" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-64 rounded-full mt-2" />
          <div className="flex items-stretch gap-3 mt-4">
            <Skeleton className="h-14 w-36" />
            <Skeleton className="h-14 flex-1" />
            <Skeleton className="h-14 w-14" />
          </div>
        </div>

        {/* Variant picker — size matrix */}
        <div className="flex flex-col gap-5">
          <Skeleton className="h-3 w-44" />
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-1.5">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </div>
    </div>

    {/* Specs */}
    <div className="border-t border-[var(--hairline)] mt-20 pt-20">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-10 w-96 mb-2" />
      <Skeleton className="h-4 w-2/3 mb-8" />
      <div className="grid grid-cols-4 border-y border-[var(--hairline)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="border-r border-[var(--hairline)] last:border-r-0 p-6"
            style={{
              borderBottom: i < 4 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <Skeleton className="h-2.5 w-20 mb-3" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
    </div>

    {/* Fitment */}
    <div className="border-t border-[var(--hairline)] mt-20 pt-20">
      <Skeleton className="h-3 w-48 mb-4" />
      <Skeleton className="h-10 w-80 mb-8" />
      <Skeleton className="h-20 w-full rounded-[var(--radius)] mb-8" />
      <div className="grid grid-cols-2 gap-x-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 py-4"
            style={{
              borderBottom: i < 6 ? "1px solid var(--hairline)" : "none",
            }}
          >
            <div className="flex-1 flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
          </div>
        ))}
      </div>
    </div>

    {/* Related */}
    <div className="border-t border-[var(--hairline)] mt-20 pt-20">
      <Skeleton className="h-3 w-32 mb-4" />
      <Skeleton className="h-10 w-64 mb-8" />
      <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-4 gap-y-8 list-none p-0 m-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <div className="rounded-[var(--radius)] border border-[var(--hairline)] bg-white">
              <Skeleton className="aspect-square rounded-b-none" />
              <div className="p-3 flex flex-col gap-2">
                <Skeleton className="h-2.5 w-1/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
)

export default ProductDetailSkeleton
