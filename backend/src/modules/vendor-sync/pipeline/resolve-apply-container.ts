import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * Choose the container that catalog / inventory workflows run under.
 *
 * Medusa hands a module's service its OWN module-scoped container in the
 * constructor (stored as `this.container_`). That container cannot resolve the
 * core product / inventory modules or the workflow engine, so running
 * `createProductsWorkflow` & friends under it fails — which is why the apply
 * step never worked from the scheduled job or the admin routes, only from the
 * `medusa exec` scripts that already hold the global container.
 *
 * The fix: every caller that holds the application/global container — a
 * scheduled job's `container`, an API route's `req.scope`, an `ExecArgs`
 * `container` — passes it in, and we prefer it. The module-scoped fallback
 * remains only so a caller that forgets degrades to the previous behavior
 * instead of crashing on `undefined`.
 */
export function resolveApplyContainer(
  provided: MedusaContainer | undefined | null,
  moduleFallback: MedusaContainer
): MedusaContainer {
  return provided ?? moduleFallback
}
