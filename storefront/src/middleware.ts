import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"
import { regionRedirectTarget } from "@lib/util/region-redirect"
import { countryCodeRedirectPath } from "@lib/util/country-code-path"
import { resolveCartRedirect } from "@lib/util/cart-redirect"

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

  // A healthy backend with zero regions is a real configuration error, but
  // `notFound()` is unsupported in Edge Middleware -- there's no route
  // boundary here to catch its control-flow throw, so it crashed the
  // middleware invocation outright (WB-096 X8 bug 3) instead of producing a
  // 404 page. Log it and return null instead: the caller (middleware(),
  // below) already treats a null region map as "fail open" (WB-081) --
  // passthrough for already-country-coded paths, redirect-to-default-region
  // for the rest -- which is the same "keep serving something" behavior we
  // want for this equally-unhealthy-backend-configuration case. Kept OUTSIDE
  // the try/catch above so this genuinely-zero-regions case is logged with
  // its own distinct message rather than being folded into the
  // network-failure log.
  if (!regions?.length) {
    console.error(
      "Middleware.ts: Medusa backend responded but returned zero regions — failing open (no country-code redirect) instead of throwing notFound(), which Edge Middleware cannot catch."
    )
    return null
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
  //
  // `regionMap.has(DEFAULT_REGION)` guard (review fix): this validates the
  // DESTINATION, not the source -- it never inspects `code`/`de`, so it does
  // NOT reinstate the has()-gated bug described above (that would gate on
  // the URL's own code and never fire for `de` at all). What it prevents is
  // an emergent loop between THIS rule and getCountryCode's fallback chain
  // (~line 101) whenever DEFAULT_REGION itself isn't a key in the map:
  // getCountryCode then falls back to `regionMap.keys().next().value` (the
  // first seeded region, e.g. "dk"), `urlHasCountryCode` is false for
  // `/us/...`, the existing 307 rule sends it to `/dk/...`, and THIS rule
  // then sees `dk !== "us"` and 301s back toward `/us/...` -- an unbounded
  // ping-pong. Same failure mode the WB-081 block above already guards
  // against for a misconfigured DEFAULT_REGION (see the comment at the top
  // of that block) -- this is that identical class of bug, one rule lower.
  // Triggers: (a) any bootstrap where seed.ts's Europe-only default ran
  // without vendor-sync's `ensureUsRegion` (CLAUDE.md's documented `pnpm ib`
  // path with no VENDOR_WHEELPROS_*_ENABLED); (b) the "United States" region
  // renamed/deleted in admin; (c) a NEXT_PUBLIC_DEFAULT_REGION typo (e.g.
  // "usa") even with both real regions present. When DEFAULT_REGION isn't
  // resolvable this rule disables itself and behavior reverts to exactly
  // pre-WB-095-X2 (a single 307 into the first available region).
  const regionRedirect = regionRedirectTarget(
    request.nextUrl.pathname,
    request.nextUrl.search,
    DEFAULT_REGION
  )
  if (regionRedirect && regionMap.has(DEFAULT_REGION)) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}${regionRedirect}`,
      301
    )
  } else if (regionRedirect) {
    // Review fix (Minor 2): the self-disable above (comment block up top)
    // was silent -- a NEXT_PUBLIC_DEFAULT_REGION typo or a deleted "us"
    // region would revert this SEO fix in production with zero signal.
    // Fires once per request that already matches the redirect's own source
    // condition (a non-default 2-letter prefix) -- a narrower slice of
    // traffic than the WB-081 fail-open log above, which fires for every
    // request site-wide during an outage, so this is no worse a hot path.
    console.error(
      `Middleware.ts: region redirect computed for "${request.nextUrl.pathname}" but DEFAULT_REGION ("${DEFAULT_REGION}") is not in the resolved region map -- disabling the redirect for this request and falling through to the pre-WB-095-X2 fallback chain.`
    )
  }

  const countryCode = regionMap && (await getCountryCode(request, regionMap))

  // WB-096 X8 bug 2: `countryCodeRedirectPath` compares lowercased on both
  // sides (getCountryCode always resolves a lowercase code) -- the old
  // inline check here compared the pathname's RAW segment against that
  // lowercase code, so a valid UPPERCASE prefix ("/US") read as having no
  // country code at all, and the "prepend" branch below then prepended
  // "/us" onto the still-raw "/US/store", producing "/us/US/store" instead
  // of "/us/store". See country-code-path.ts for the full writeup.
  const countryCodeRedirect = countryCode
    ? countryCodeRedirectPath(
        request.nextUrl.pathname,
        request.nextUrl.search,
        countryCode
      )
    : null

  const urlHasCountryCode = !!countryCode && countryCodeRedirect === null

  // check if one of the country codes is in the url
  if (
    urlHasCountryCode &&
    (!isOnboarding || onboardingCookie) &&
    (!cartId || cartIdCookie)
  ) {
    return NextResponse.next()
  }

  // Base redirect target: the country-code correction (missing OR
  // wrong-cased prefix) if one is needed, otherwise the request's own URL
  // unchanged -- e.g. the URL is already fully canonical and only a cart
  // cookie needs setting (see `cartRedirect` below).
  let redirectUrl = countryCodeRedirect
    ? `${request.nextUrl.origin}${countryCodeRedirect}`
    : request.nextUrl.href

  // WB-096 X8 bug 1: `resolveCartRedirect` decouples "should we redirect to
  // the address step" (only when no step is set yet) from "should we set
  // the cart cookie" (whenever it's missing, regardless of step) -- see
  // cart-redirect.ts. The old code gated both on the same condition
  // (`cartId && !checkoutStep`), so a `?cart_id=X&step=<already-set>` link
  // with no cookie yet fell through every branch untouched and hit the
  // self-redirect fallback below.
  const cartRedirect = resolveCartRedirect(cartId, checkoutStep, !!cartIdCookie)

  if (cartRedirect.appendStep) {
    redirectUrl = `${redirectUrl}&step=address`
  }

  // WB-096 X8 bug 1 (continued): never redirect to the exact URL we were
  // already given -- that equality is precisely what turned "nothing left
  // to correct but the cookie" into an infinite self-redirect. When no
  // country-code or cart-step correction changed the target, fall through
  // to `next()` instead of `redirect()`; the cart cookie (if any) is still
  // set below regardless of which response type this ends up being.
  const needsRedirect = redirectUrl !== request.nextUrl.href

  let response = needsRedirect
    ? NextResponse.redirect(redirectUrl, 307)
    : NextResponse.next()

  if (cartRedirect.setCookie && cartId) {
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
  //
  // `_next/image` (WB-096 X7): latent today, not yet reachable, because
  // `next.config.js` sets `images.unoptimized: true`, so next/image never
  // proxies through Next's `/_next/image` optimizer endpoint in this app --
  // only `_next/static` traffic exists to exclude. If that flag is ever
  // flipped on, every optimizer request would otherwise route through this
  // middleware, get read as a country-code-less path, and get redirected
  // into `/us/_next/image?...` (a 404) instead of serving the image.
  // Excluded pre-emptively so that future flip is safe by default.
  matcher: [
    "/((?!api|_next/static|_next/image|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image|icon|.*\\.png|.*\\.jpg|.*\\.gif|.*\\.svg).*)",
  ],
}
