import { getBaseURL } from "@lib/util/env"

// WB-071 F-D: the store runs single-region -- the catalog is USD-only with
// no localized content, so every indexable page's canonical is pinned to the
// default region regardless of which country-code prefix served the request.
// Same env var + fallback the rest of the app already reads for this
// (middleware.ts, sitemap.ts).
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "us"

/**
 * WB-095 X2: builds an absolute canonical URL for an indexable page.
 *
 * Must be absolute -- never the bare-relative form. The one canonical that
 * used to exist in this app (the now-deleted `/categories` page) was a bare
 * relative string like `"wheels"`; Next resolves a relative canonical
 * against `metadataBase`'s *origin root*, not the current page's directory,
 * so it produced `https://<host>/wheels` -- a URL that never existed. See
 * WB-086. Building the full origin + region prefix here avoids that trap.
 *
 * `path` is a root-relative path with no country-code prefix -- e.g.
 * "/store", "/products/some-handle", or "/" for the homepage. Leading and
 * trailing slashes are normalized, so callers don't need to worry about
 * double slashes either.
 */
export function canonicalUrl(path: string): string {
  const base = getBaseURL().replace(/\/+$/, "")
  const trimmedPath = path.replace(/^\/+/, "").replace(/\/+$/, "")
  return trimmedPath
    ? `${base}/${DEFAULT_REGION}/${trimmedPath}`
    : `${base}/${DEFAULT_REGION}`
}
