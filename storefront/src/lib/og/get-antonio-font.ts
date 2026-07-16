import "server-only"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Antonio 700, vendored — NOT fetched from Google Fonts at build time.
 *
 * next/og's ImageResponse (satori) can't consume next/font — it needs raw
 * font bytes. An earlier version of this file fetched those bytes from
 * Google Fonts on every call, and these three routes (opengraph-image.tsx,
 * twitter-image.tsx, icon.tsx) are static-prerendered, so that fetch ran at
 * `next build` time. A Google Fonts outage or a build environment with
 * restricted egress made the ENTIRE storefront build fail — the try/catch
 * correctly returned null on failure, but the consuming code then set
 * `fontFamily: undefined` in a satori style object, which is not the same as
 * omitting the key (satori calls `.split()` on the value and throws). See
 * git history for the reproduction.
 *
 * Vendoring removes the network dependency outright, and Antonio 700 is
 * *already* downloaded once by `next/font/google` in `app/layout.tsx` for
 * the visible UI (storefront/CLAUDE.md's Fonts section: keep fonts
 * self-hosted, don't reach for raw Google Fonts requests) — the old fetch
 * here was a redundant second round-trip for the same asset family.
 *
 * `antonio-700.ttf` below is Antonio 700 (SIL OFL licensed — see `OFL.txt`
 * alongside this file for the license text and copyright), subset via
 * Google's `css2?family=Antonio:wght@700&text=...` API to just the glyphs
 * the wordmark scene and the favicon glyph render ("WHEEL/BUILDS" + "W"),
 * which keeps the vendored file to ~2KB instead of the full character set.
 * If the rendered copy ever needs a character outside that set, regenerate
 * by re-running the same subsetting request with the new text and
 * overwriting this file — it is not derived at build time anymore.
 */
const FONT_PATH = join(process.cwd(), "src/lib/og/antonio-700.ttf")

let cached: Buffer | null | undefined

/**
 * Returns the vendored Antonio 700 TTF bytes, or `null` if the file can't be
 * read for some reason (defense in depth — this should not happen in
 * practice since the file ships in the repo).
 *
 * Callers MUST treat `null` as "omit the custom font entirely" by
 * conditionally spreading `fontFamily` out of their style objects (e.g.
 * `...(fontLoaded ? { fontFamily: "Antonio" } : {})`) — never
 * `fontFamily: fontLoaded ? "Antonio" : undefined`. In satori,
 * `fontFamily: undefined` is NOT equivalent to omitting the key: the key's
 * mere presence makes satori's style resolver call `.split()` on the value,
 * which throws on `undefined`. Because these routes are static-prerendered,
 * that throw fails `next build` itself, not just a single request.
 */
export async function getAntonioFontData(): Promise<Buffer | null> {
  if (cached !== undefined) {
    return cached
  }
  try {
    cached = await readFile(FONT_PATH)
  } catch {
    cached = null
  }
  return cached
}
