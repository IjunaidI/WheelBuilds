/**
 * Route-level loading fallback for /store. Next.js renders this automatically
 * during navigation to /store and during Suspense boundaries above the
 * server-fetched product list. Shape matches `<DiscoveryTemplate>` so the
 * layout doesn't shift when real data lands.
 */
import DiscoveryTemplateSkeleton from "@modules/discovery/templates/skeleton"

export default function Loading() {
  return <DiscoveryTemplateSkeleton />
}
