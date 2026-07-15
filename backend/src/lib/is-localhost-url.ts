/**
 * True when `url` resolves to a loopback host (localhost/127.0.0.1) — i.e. the
 * `STOREFRONT_URL` default from lib/constants.ts, which only makes sense in dev.
 *
 * Shared by every subscriber that builds a customer-facing storefront link
 * (password reset, order confirmation, shipping confirmation) so a
 * misconfigured `STOREFRONT_URL` in production logs loudly instead of quietly
 * shipping dead links. See `auth-password-reset.ts` for the original pattern.
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}
