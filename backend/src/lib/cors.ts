/**
 * Resolve a CORS origin list with a safe, non-silent fallback (WB-039).
 *
 * - value set            -> value (verbatim)
 * - unset + production   -> throw. We cannot derive a safe prod CORS default (the backend
 *                           does not know the storefront origin), so failing loud at startup
 *                           beats silently allowing or blocking all origins.
 * - unset + non-prod     -> devDefault, with a console.warn naming the var to set.
 */
export function resolveCors(
  value: string | undefined,
  opts: { isProduction: boolean; devDefault: string; name: string },
): string {
  if (value != null && value.trim() !== '') return value
  if (opts.isProduction) {
    throw new Error(
      `${opts.name} is required in production (NODE_ENV=production) but is not set. ` +
        `Set ${opts.name} to a comma-separated list of allowed origins ` +
        `(e.g. https://your-storefront.example).`,
    )
  }
  console.warn(
    `[cors] ${opts.name} not set — using dev default "${opts.devDefault}". ` +
      `Set ${opts.name} explicitly before deploying.`,
  )
  return opts.devDefault
}
