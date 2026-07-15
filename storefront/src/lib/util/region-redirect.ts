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
//
// Accepted side effect (review, Minor 2): because this is gated on
// "2-letter code != defaultRegion" and NOT on `regionMap.has(code)`, ANY
// 2-letter first segment now 301s into `/us/...` -- including garbage like
// `/xx/store`, which previously 307'd into `/us/xx/store` and 404'd. A
// stray 2-letter typo now permanently (301, browser-cached) resolves to a
// real page instead of a clean 404.
//
// Corrected rationale (review): a has()-gated SOURCE check --
// `code !== defaultRegion && regionMap.has(code)` -- IS available here, and
// would NOT reinstate the `/de` bug: `regionMap.has("de")` is true (it's a
// real seeded EUR region, see the file header), so that check would still
// fire and redirect `/de`; `regionMap.has("xx")` is false, so it would
// correctly sit out for garbage, letting `/xx` fall through to the
// pre-existing 307-then-404 path exactly as before. It's rejected anyway,
// for a durability reason: gating the redirect on the region map makes the
// 301 track admin state. If the EUR region is ever deleted, `has("de")`
// goes false and every previously-indexed/browser-cached `/de` URL would
// start 404ing instead of continuing to resolve to `/us`. Gating on the raw
// segment instead means the redirect survives that deletion -- durable for
// real, previously-indexed URLs, at the cost of a permanent soft-404 for
// the small, fixed set of 2-letter typos that were never real routes
// anyway. Not worth a special case.
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
