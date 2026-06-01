/**
 * Resolve a module service from a request scope, returning null instead of
 * throwing when the module is not registered (e.g. wheel-size when
 * WHEEL_SIZE_API_KEY is unset). Lets the vehicle-catalog / fitment routes
 * degrade to an empty payload or 503 rather than a raw 500.
 */
export function resolveOptional<T = any>(
  scope: { resolve: (key: string) => T },
  key: string
): T | null {
  try {
    return scope.resolve(key)
  } catch {
    return null
  }
}
