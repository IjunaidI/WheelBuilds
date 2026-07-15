// WB-095 X2 -- non-default region prefixes are REAL, resolvable regions, not
// unknown ones. backend/src/scripts/seed.ts (~139-151) seeds a EUR region
// covering gb/de/dk/se/fr/es/it alongside the `us` region, so
// `regionMap.has("de")` is TRUE. middleware.ts's existing
// `urlHasCountryCode` check (~153-163) treats any code present in the region
// map as valid and returns `NextResponse.next()` -- so `/de/products/<handle>`
// serves untouched, live, EUR-priced. The store operates single-region (US
// only, USD-only catalog -- WB-071 F-D), so every non-default region prefix
// must permanently redirect into the default region instead.
//
// This decision is deliberately gated on the raw URL segment vs
// `defaultRegion`, NEVER on `regionMap.has(code)` -- a has()-gated rule would
// never fire for `de` (or gb/dk/se/fr/es/it), which is the entire bug. That
// also means this function takes no region map at all: it can't consult one
// even by accident.
//
// Plain pure function, NOT a `"use server"` module -- every export of one of
// those must be async, and this needs to stay sync + side-effect-free to be
// unit-testable without Next's request machinery, and to be safely callable
// from Edge middleware.
const COUNTRY_CODE_SEGMENT = /^[a-z]{2}$/

/**
 * Given a request pathname + search string, returns the path (with query
 * string) to 301-redirect to when the URL's first segment is a 2-letter
 * region code OTHER than `defaultRegion` -- or `null` when no redirect is
 * warranted (already on the default region, or the path has no 2-letter
 * country-code segment at all, in which case the existing 307
 * no-country-code path in middleware.ts handles it).
 *
 * Loop safety: the returned path always starts with `/${defaultRegion}`, and
 * this function only ever returns non-null when the current segment is NOT
 * `defaultRegion` -- so re-running this same function against its own output
 * always yields `null`. It cannot redirect into itself.
 */
export function regionRedirectTarget(
  pathname: string,
  search: string,
  defaultRegion: string
): string | null {
  const segments = pathname.split("/")
  const code = segments[1]

  if (!code || !COUNTRY_CODE_SEGMENT.test(code)) {
    return null
  }

  if (code === defaultRegion) {
    return null
  }

  const rest = segments.slice(2).join("/")
  const restPath = rest ? `/${rest}` : ""
  const queryString = search || ""

  return `/${defaultRegion}${restPath}${queryString}`
}
