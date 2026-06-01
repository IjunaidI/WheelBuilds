/**
 * Resolve a module service from a request scope, returning null instead of
 * throwing when the module is not registered (e.g. wheel-size when
 * WHEEL_SIZE_API_KEY is unset). Lets the vehicle-catalog / fitment routes
 * degrade to an empty payload or 503 rather than a raw 500.
 *
 * `T` defaults to `any` on purpose: every call site null-checks the result and
 * then calls a known service method, mirroring the `scope.resolve(...) as any`
 * idiom these Medusa routes already used. Pass an explicit `T` for a typed result.
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
