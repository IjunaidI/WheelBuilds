/**
 * Route-level loading fallback for /tires. Next.js renders this automatically
 * during navigation to /tires and during Suspense boundaries above the
 * server-fetched product list. Shape matches `<TireDiscoveryTemplate>` so the
 * layout doesn't shift when real data lands.
 */
import TireDiscoveryTemplateSkeleton from "@modules/tire-discovery/templates/skeleton"

export default function Loading() {
  return <TireDiscoveryTemplateSkeleton />
}
