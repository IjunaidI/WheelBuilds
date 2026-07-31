/**
 * Which discovery surface a text search should land on (WB-126).
 *
 * Every search used to `router.push(/${countryCode}/store?…)` unconditionally,
 * and `/store` is scoped to `product_type = "wheel"`. Two consequences, both
 * reported by the client:
 *
 *   1. Searching from `/tires` bounced you back to wheels, so the tyre
 *      catalogue could not be searched at all.
 *   2. Any tyre-only brand was unfindable. Verified live: "Falken" is a TYRE
 *      brand with **65 products and 0 wheels**, so a wheel-scoped search
 *      honestly returned nothing while the products plainly existed.
 *
 * Tyre discovery already reads `?q` (`tire-discovery/data/get-tire-products.ts`),
 * so the capability was there — only the routing was missing.
 *
 * Pure and separately testable: this runs inside the globally-mounted search
 * drawer, which deliberately avoids `useSearchParams()` (no Suspense boundary
 * in the root layout — it would de-opt the whole app shell to dynamic
 * rendering), so the caller passes `pathname` in rather than this reading it.
 */

/** Discovery surfaces a search can land on. */
export type SearchSurface = "wheels" | "tires"

/**
 * Tyre surfaces: the tyre listing, and a tyre PDP.
 *
 * A PDP path alone can't say which kind of product it is (`/products/<handle>`
 * serves both — see the `kind` discriminant in product-detail), so only
 * `/tires*` counts here. Getting it wrong costs a shopper one extra click,
 * never a wrong result: both surfaces search the same index.
 */
export function surfaceFromPathname(pathname: string | null | undefined): SearchSurface {
  if (!pathname) return "wheels"
  // Next's `usePathname()` never carries a query or hash, but a caller could
  // reasonably pass `window.location.href` instead — tolerate both rather
  // than silently mis-routing.
  const bare = pathname.split(/[?#]/)[0]
  // Strip the mandatory /<countryCode> prefix before matching.
  const rest = bare.replace(/^\/[a-z]{2}(?=\/|$)/i, "")
  return /^\/tires(\/|$)/.test(rest) ? "tires" : "wheels"
}

/** The path (without country code) for a surface. */
export function pathForSurface(surface: SearchSurface): string {
  return surface === "tires" ? "/tires" : "/store"
}

/**
 * Full destination for a submitted search, country code included.
 *
 * `extraParams` carries through anything the caller already resolved — today
 * that is WB-088 D13's `fit=0` opt-out, which must survive a search or the
 * results page silently re-enables fitment filtering.
 */
export function searchDestination(
  countryCode: string,
  pathname: string | null | undefined,
  query: string,
  extraParams?: Record<string, string>
): string {
  const params = new URLSearchParams({ q: query })
  for (const [k, v] of Object.entries(extraParams ?? {})) params.set(k, v)
  const surface = surfaceFromPathname(pathname)
  return `/${countryCode}${pathForSurface(surface)}?${params.toString()}`
}
