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
    return null // already canonical
  }

  // Compared lowercased on both sides (countryCode is already lowercase,
  // per getCountryCode) -- this is the fix: "US" now correctly reads as
  // the SAME code as "us", just wrong-cased, rather than as a missing one.
  const sameCodeDifferentCase = rawSegment?.toLowerCase() === countryCode

  const rest = sameCodeDifferentCase ? segments.slice(2) : segments.slice(1)
  const joined = rest.join("/")
  const restPath = joined ? `/${joined}` : ""
  const queryString = search || ""

  return `/${countryCode}${restPath}${queryString}`
}
