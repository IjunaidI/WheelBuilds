// WB-096 X8 bug 2 -- `/US/store` redirecting to `/us/US/store` (a 404).
//
// `getCountryCode` (middleware.ts) always resolves a LOWERCASE code -- it
// lowercases the pathname's first segment before checking it against the
// region map (`request.nextUrl.pathname.split("/")[1]?.toLowerCase()`).
// middleware.ts's old `urlHasCountryCode` check then compared that
// lowercase code against the pathname's RAW (un-lowercased) first segment
// (`request.nextUrl.pathname.split("/")[1] === countryCode`), so a valid
// but upper-cased prefix like "/US" read as having NO country code at all.
// Falling into the "prepend the country code" branch then prepended the
// (lowercase) code onto the STILL-RAW, STILL-UPPERCASE pathname --
// "/US/store" became "/us/US/store" instead of "/us/store".
//
// This function fixes it by comparing lowercased on both sides when
// deciding whether an existing segment is "the same code, just
// differently cased" (STRIP it before prepending the canonical one) versus
// "no country-code segment at all, or a genuinely different segment"
// (prepend fresh onto the untouched pathname, exactly the pre-existing,
// unbroken behavior for code-less paths like "/store").
//
// Plain pure function, NOT a `"use server"` module -- mirrors
// `region-redirect.ts`'s pattern: sync, side-effect-free, unit-testable
// without Next's request machinery, safely callable from Edge middleware.
//
// Returns the absolute path+query to redirect to, or `null` when the
// pathname's first segment is EXACTLY (case-sensitively) `countryCode`
// already -- nothing to correct for country-code reasons.
export function countryCodeRedirectPath(
  pathname: string,
  search: string,
  countryCode: string
): string | null {
  const segments = pathname.split("/")
  const rawSegment = segments[1]

  if (rawSegment === countryCode) {
    // WB-121 Q-17: the country code is canonical, but the ROUTE segment may
    // still be wrong-cased ("/us/STORE"). Only return "nothing to correct"
    // when that is canonical too.
    const routeSegment = segments[2]
    if (canonicalRouteSegment(routeSegment) === routeSegment) {
      return null // already canonical
    }
  }

  // Compared lowercased on both sides (countryCode is already lowercase,
  // per getCountryCode) -- this is the fix: "US" now correctly reads as
  // the SAME code as "us", just wrong-cased, rather than as a missing one.
  const sameCodeDifferentCase = rawSegment?.toLowerCase() === countryCode

  const rest = sameCodeDifferentCase ? segments.slice(2) : segments.slice(1)
  // WB-121 Q-17: canonicalise the ROUTE segment's case too, so "/US/STORE"
  // lands on "/us/store" rather than the "/us/STORE" that 404s. Only this one
  // segment -- see canonicalRouteSegment for why deeper ones must not be
  // touched.
  if (rest.length) rest[0] = canonicalRouteSegment(rest[0]) as string
  const joined = rest.join("/")
  const restPath = joined ? `/${joined}` : ""
  const queryString = search || ""

  return `/${countryCode}${restPath}${queryString}`
}

// WB-121 Q-17 -- "/US/STORE" 404s.
//
// The country-code fix above canonicalises only the FIRST segment, so
// "/US/STORE" redirected to "/us/STORE", which matches no route and 404s.
// Any capitalised URL from an email, a printed asset or a mistyped address
// dead-ends.
//
// ⚠️ The whole pathname CANNOT simply be lowercased. Deeper segments carry
// CASE-SENSITIVE identifiers -- most importantly the order ULID in
// "/order/confirmed/[id]" and "/account/orders/details/[id]"
// (e.g. "order_01KYPQK3ERBAQCC9VGCJE5Y2SS"). For a guest checkout the emailed
// order link is their ONLY route back to the order, so lowercasing it would
// turn a cosmetic 404 into a lost order.
//
// So this is a deliberate ALLOWLIST of the top-level route segments, applied
// to that one segment only. Product handles, brand/style slugs and every id
// below it keep their exact case. Adding a new top-level route without adding
// it here costs nothing but the case-insensitivity.
const ROUTE_SEGMENTS = new Set([
  "account",
  "brands",
  "cart",
  "checkout",
  "collections",
  "contact",
  "forgot-password",
  "order",
  "privacy",
  "products",
  "reset-password",
  "returns",
  "shipping",
  "store",
  "styles",
  "terms",
  "tires",
])

/**
 * Lowercases a top-level route segment when it differs from its canonical
 * form only by case. Returns the segment unchanged otherwise -- including for
 * unknown segments, which must 404 rather than be silently rewritten.
 */
export function canonicalRouteSegment(segment: string | undefined): string | undefined {
  if (!segment) return segment
  const lower = segment.toLowerCase()
  return ROUTE_SEGMENTS.has(lower) ? lower : segment
}
