import { HttpTypes } from "@medusajs/types"
import { notFound } from "next/navigation"
import { NextRequest, NextResponse } from "next/server"
import { regionRedirectTarget } from "@lib/util/region-redirect"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap(): Promise<Map<
  string,
  HttpTypes.StoreRegion
> | null> {
  const { regionMap, regionMapUpdated } = regionMapCache

  const cacheIsUsable =
    !!regionMap.keys().next().value &&
    regionMapUpdated >= Date.now() - 3600 * 1000

  if (cacheIsUsable) {
    return regionMapCache.regionMap
  }

  // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
  let regions: HttpTypes.StoreRegion[] | undefined
  try {
    const res = await fetch(`${BACKEND_URL}/store/regions`, {
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      next: {
        revalidate: 3600,
        tags: ["regions"],
      },
    })
    // Medusa reports 4xx/5xx with a JSON body — res.json() would "succeed"
    // with no regions and skip the catch, landing in notFound() below and
    // bypassing the stale-cache fallback (review fix). Throw into the catch
    // instead: an erroring backend is the same outage as an unreachable one.
    if (!res.ok) {
      throw new Error(`region fetch responded ${res.status}`)
    }
    regions = (await res.json()).regions
  } catch (e) {
    // WB-081: backend unreachable (or returned non-JSON). Without this guard a
    // cold edge instance 500'd EVERY page for the duration of a backend blip.
    // Serve the stale cache when we have one; otherwise signal the caller to
    // fail open on the default region.
    if (regionMap.keys().next().value) {
      return regionMapCache.regionMap
    }
    console.error(
      "Middleware.ts: region fetch failed and no cached region map exists — failing open on the default region.",
      e
    )
    return null
  }

  // A healthy backend with zero regions is a real configuration error — 404.
  // (Kept OUTSIDE the try/catch so notFound()'s control-flow throw isn't
  // swallowed by the network-failure fallback above.)
  if (!regions?.length) {
    notFound()
  }

  // Create a map of country codes to regions.
  regions.forEach((region: HttpTypes.StoreRegion) => {
    region.countries?.forEach((c) => {
      regionMapCache.regionMap.set(c.iso_2 ?? "", region)
    })
  })

  regionMapCache.regionMapUpdated = Date.now()

  return regionMapCache.regionMap
}

/**
 * Fetches regions from Medusa and sets the region cookie.
 * @param request
 * @param response
 */
async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  try {
    let countryCode

    const urlCountryCode = request.nextUrl.pathname.split("/")[1]?.toLowerCase()

    if (urlCountryCode && regionMap.has(urlCountryCode)) {
      countryCode = urlCountryCode
    } else if (regionMap.has(DEFAULT_REGION)) {
      countryCode = DEFAULT_REGION
    } else if (regionMap.keys().next().value) {
      countryCode = regionMap.keys().next().value
    }

    return countryCode
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Middleware.ts: Error getting the country code. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable?"
      )
    }
  }
}

/**
 * Middleware to handle region selection and onboarding status.
 */
export async function middleware(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const isOnboarding = searchParams.get("onboarding") === "true"
  const cartId = searchParams.get("cart_id")
  const checkoutStep = searchParams.get("step")
  const onboardingCookie = request.cookies.get("_medusa_onboarding")
  const cartIdCookie = request.cookies.get("_medusa_cart_id")

  const regionMap = await getRegionMap()

  // WB-081 fail-open: backend down + cold cache. Pass through anything that
  // already looks country-coded (2-letter first segment) and send the rest to
  // the default region — pages own their data errors; the site keeps serving.
  // Self-corrects on the next request once the backend is reachable again.
  if (!regionMap) {
    // The redirect target's first segment MUST satisfy the 2-letter
    // passthrough above, or a misconfigured NEXT_PUBLIC_DEFAULT_REGION
    // (e.g. "usa") would 307 into itself forever (review fix).
    const fallbackRegion = /^[a-z]{2}$/.test(DEFAULT_REGION)
      ? DEFAULT_REGION
      : "us"
    const seg = request.nextUrl.pathname.split("/")[1]?.toLowerCase()
    if (seg && seg.length === 2) {
      return NextResponse.next()
    }
    const redirectPath =
      request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname
    const queryString = request.nextUrl.search ?? ""
    return NextResponse.redirect(
      `${request.nextUrl.origin}/${fallbackRegion}${redirectPath}${queryString}`,
      307
    )
  }

  // WB-095 X2: `/de` (and gb/dk/se/fr/es/it) is a REAL, resolvable region --
  // seed.ts seeds a EUR region covering those countries alongside `us`, so
  // `regionMap.has("de")` is true and the urlHasCountryCode check just below
  // would happily return NextResponse.next(), serving a live, indexable,
  // EUR-priced duplicate of every US page. The store operates single-region
  // (US-only, USD-only catalog -- WB-071 F-D), so every non-default region
  // prefix permanently redirects into the default region instead.
  //
  // Placed AFTER the fail-open block above (not folded into it): during a
  // backend outage / cold region cache, `/de/...` must keep passing through
  // untouched (WB-081) -- that early-return already happened by the time we
  // get here, so this rule only ever runs against a healthy, resolved region
  // map. `regionRedirectTarget` itself takes no region map argument, so this
  // is gated purely on `code !== DEFAULT_REGION`, never on
  // `regionMap.has(code)` -- see its doc comment for why that distinction is
  // the entire bug. 301 (permanent): unlike the 307s elsewhere in this file
  // (which depend on session-ish state -- cart_id/onboarding cookies, a
  // possibly-stale region cache), a non-default region prefix is a
  // permanent policy decision that will not change request-to-request.
  const regionRedirect = regionRedirectTarget(
    request.nextUrl.pathname,
    request.nextUrl.search,
    DEFAULT_REGION
  )
  if (regionRedirect) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}${regionRedirect}`,
      301
    )
  }

  const countryCode = regionMap && (await getCountryCode(request, regionMap))

  const urlHasCountryCode =
    countryCode && request.nextUrl.pathname.split("/")[1] === countryCode

  // check if one of the country codes is in the url
  if (
    urlHasCountryCode &&
    (!isOnboarding || onboardingCookie) &&
    (!cartId || cartIdCookie)
  ) {
    return NextResponse.next()
  }

  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname

  const queryString = request.nextUrl.search ? request.nextUrl.search : ""

  let redirectUrl = request.nextUrl.href

  let response = NextResponse.redirect(redirectUrl, 307)

  // If no country code is set, we redirect to the relevant region.
  if (!urlHasCountryCode && countryCode) {
    redirectUrl = `${request.nextUrl.origin}/${countryCode}${redirectPath}${queryString}`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
  }

  // If a cart_id is in the params, we set it as a cookie and redirect to the address step.
  if (cartId && !checkoutStep) {
    redirectUrl = `${redirectUrl}&step=address`
    response = NextResponse.redirect(`${redirectUrl}`, 307)
    response.cookies.set("_medusa_cart_id", cartId, { maxAge: 60 * 60 * 24 })
  }

  // Set a cookie to indicate that we're onboarding. This is used to show the onboarding flow.
  if (isOnboarding) {
    response.cookies.set("_medusa_onboarding", "true", { maxAge: 60 * 60 * 24 })
  }

  return response
}

export const config = {
  // prevents redirecting on static files + the root metadata routes —
  // robots.txt/sitemap.xml must serve at the domain root, NOT get
  // country-prefixed into /us/robots.txt (a 404) (WB-082 review fix).
  // opengraph-image/twitter-image/icon (WB-095 X1) are next/og ImageResponse
  // routes at the domain root for the same reason — without the exclusion
  // they 307 to /us/icon etc. and 404.
  //
  // NOTE: no `favicon.ico` literal here (removed in the WB-095 Task 1 fix
  // wave). That exclusion existed to let Next's static-file short-circuit
  // serve `public/favicon.ico`, but Task 1 deleted that file in favor of the
  // dynamic `app/icon.tsx` route above. With the literal still excluded,
  // `/favicon.ico` bypassed this middleware and fell through to
  // `[countryCode]/page.tsx` with countryCode="favicon.ico", rendering the
  // full homepage as 200 HTML instead of 404ing. Browsers resolve the actual
  // favicon via the `<link rel="icon">` tag Next emits from `app/icon.tsx`,
  // not a literal `/favicon.ico` request.
  matcher: [
    "/((?!api|_next/static|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image|icon|.*\\.png|.*\\.jpg|.*\\.gif|.*\\.svg).*)",
  ],
}
