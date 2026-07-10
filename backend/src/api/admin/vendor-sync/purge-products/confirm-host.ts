/**
 * Guard for POST /admin/vendor-sync/purge-products.
 *
 * Mirrors the --confirm-host contract used by vendor-sync-dev-wipe.ts:
 * the caller must echo back the hostname parsed out of DATABASE_URL. This
 * makes it impossible to purge the live catalog with a bare, copy-pasted
 * request — the confirm value is DB-target-specific and won't match if the
 * request is replayed against a different environment.
 */
export function hostFromDatabaseUrl(url?: string): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

export function confirmMatches(
  body: { confirm?: string } | undefined,
  url = process.env.DATABASE_URL
): boolean {
  const host = hostFromDatabaseUrl(url)
  return !!host && !!body?.confirm && body.confirm === host
}
