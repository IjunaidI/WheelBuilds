import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/** Both env vars must be set for the Meilisearch plugin to be registered. */
export function meiliConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MEILISEARCH_HOST) && Boolean(env.MEILISEARCH_ADMIN_KEY)
}

/**
 * Emit the @rokmohar/medusa-plugin-meilisearch `meilisearch.sync` event, whose
 * handler re-indexes published products and DELETES orphaned/drafted docs
 * (WB-089 L1 belt-and-braces). No-op + returns false when Meili is unconfigured.
 */
export async function emitMeiliReconcile(container: MedusaContainer): Promise<boolean> {
  if (!meiliConfigured(process.env)) return false
  const eventBus = container.resolve(Modules.EVENT_BUS)
  await eventBus.emit({ name: "meilisearch.sync", data: {} })
  return true
}
