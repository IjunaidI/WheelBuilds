/**
 * Route-level loading fallback for the whole `(checkout)` group. Next.js
 * renders this automatically on a slow hard load while `checkout/page.tsx`
 * awaits the cart + customer fetch -- previously the group had no
 * `loading.tsx` at all, so it rendered blank until that resolved.
 *
 * `(checkout)`'s own `layout.tsx` renders the nav/footer chrome around
 * `{children}` regardless, so this only needs to fill the body. It
 * deliberately uses the legacy plain-Tailwind-gray idiom the shipped
 * `/cart` loading fallback (`skeleton-cart-page`) uses rather than the
 * shadcn `<Skeleton>` primitive, whose fill color resolves from a
 * `.frame`-scoped CSS variable (`--hairline`) -- matching how the checkout
 * form itself (`CheckoutForm`/`CheckoutSummary`) is legacy Medusa-UI +
 * Tailwind, not the WB primitives. Shape mirrors the real page's two-column
 * grid (form column + order-summary aside).
 */
export default function Loading() {
  return (
    <div className="min-h-screen px-5 small:px-10 pb-14">
      <div className="grid grid-cols-1 small:grid-cols-[1fr_420px] gap-10 small:gap-12 py-8 small:py-10 max-w-[1320px] mx-auto">
        <div className="min-w-0">
          <div className="mb-8 small:mb-10">
            <div className="h-3 w-32 bg-gray-200 animate-pulse mb-3 rounded" />
            <div className="h-10 w-64 small:h-14 small:w-96 bg-gray-200 animate-pulse mb-3 rounded" />
            <div className="h-4 w-full max-w-[480px] bg-gray-200 animate-pulse rounded" />
          </div>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 w-full bg-gray-100 border border-gray-200 rounded-md animate-pulse"
              />
            ))}
          </div>
        </div>
        <aside className="min-w-0 flex flex-col gap-4">
          <div className="h-8 w-40 bg-gray-200 animate-pulse rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-full bg-gray-100 animate-pulse rounded" />
          ))}
          <div className="h-10 w-full bg-gray-200 animate-pulse rounded mt-4" />
        </aside>
      </div>
    </div>
  )
}
