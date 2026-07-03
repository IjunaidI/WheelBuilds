/**
 * Whether a primary-nav link should render as active for the current pathname.
 *
 * Strips the leading `/<countryCode>` segment, then matches the link's section
 * path exactly or as a path prefix (so `/tires/<x>` still lights up "Tires").
 * The trailing-slash guard prevents `/store` from matching `/storefront`.
 * Placeholder `#` links never match. Product pages (`/products/*`) match nothing —
 * wheel vs tire is not encoded in the path, so no section link is highlighted there.
 */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (!href.startsWith("/")) return false
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/i, "") || "/"
  return stripped === href || stripped.startsWith(href + "/")
}
