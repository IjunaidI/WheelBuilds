/**
 * Route-level loading fallback for the home page (`/`). Next.js renders this
 * automatically on a slow hard load while `getHomeCatalog()` resolves.
 * Shape matches the hero + first two product rows so the layout doesn't
 * shift when real data lands.
 */
import HomeTemplateSkeleton from "@modules/home/templates/skeleton"

export default function Loading() {
  return <HomeTemplateSkeleton />
}
