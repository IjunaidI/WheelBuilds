import { STYLE_DEFS } from "./style-map"

export type StyleDef = (typeof STYLE_DEFS)[number]

/**
 * Kebab-case a `STYLE_DEFS` label into its `/styles/<slug>` URL segment
 * (WB-099 Task 4). One rule handles every real label without a special
 * case: lowercase, then collapse any RUN of characters outside `[a-z0-9]`
 * into a single hyphen, trimming leading/trailing hyphens.
 *
 *   "STREET"          -> "street"
 *   "TRUCK & DUALLY"  -> "truck-dually"   (" & " is a 3-char non-alnum run)
 *   "OFF-ROAD"        -> "off-road"       (the existing "-" is already a
 *                                           1-char run, so it passes through
 *                                           unchanged)
 *
 * `styleFromSlug` below re-derives this same slug for every `STYLE_DEFS`
 * entry to resolve a route param, so the two must stay in lockstep — this
 * is the only place either direction is computed.
 */
export function styleSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Resolve a `/styles/[slug]` route param back to its `STYLE_DEFS` entry, by
 * kebab-casing every label the same way the `/styles` index built the tile
 * hrefs (`styleSlug`, above) and matching by exact equality. Unknown slug ->
 * `null` (never throws) so the page can `notFound()`.
 */
export function styleFromSlug(slug: string): StyleDef | null {
  return STYLE_DEFS.find((def) => styleSlug(def.label) === slug) ?? null
}
