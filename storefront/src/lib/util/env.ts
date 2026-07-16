/**
 * WB-095 X3: the loopback value getBaseURL() falls back to when
 * NEXT_PUBLIC_BASE_URL is unset. check-env-variables.js now requires
 * NEXT_PUBLIC_BASE_URL at build time, so this fallback should be
 * unreachable in a real deploy -- it's kept as a belt-and-braces value so
 * callers that build absolute URLs from getBaseURL() (sitemap.ts,
 * robots.ts) can detect it and refuse to publish loopback URLs, e.g. if
 * this module is ever exercised outside next.config.js's
 * checkEnvVariables() gate (a direct unit test or import of
 * sitemap()/robots() bypasses next.config.js entirely).
 */
export const FALLBACK_BASE_URL = "https://localhost:8000"

export const getBaseURL = () => {
  return process.env.NEXT_PUBLIC_BASE_URL || FALLBACK_BASE_URL
}

/**
 * Pure predicate: true when `url` IS the getBaseURL() fallback (a trailing
 * slash is tolerated). Extracted from sitemap.ts/robots.ts so the
 * detection logic is unit-testable without a running Next.js request.
 */
export const isFallbackBaseUrl = (url: string): boolean =>
  url.replace(/\/+$/, "") === FALLBACK_BASE_URL
