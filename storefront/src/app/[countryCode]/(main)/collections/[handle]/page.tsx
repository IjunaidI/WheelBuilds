import { permanentRedirect } from "next/navigation"

import { getCollectionByHandle } from "@lib/data/collections"
import { collectionRedirectUrl } from "@lib/util/collection-redirect-url"

type Props = {
  params: Promise<{ handle: string; countryCode: string }>
}

/**
 * `/collections/[handle]` retired in favor of Discovery (WB-086 D1). This
 * legacy collection-listing page is now a thin server redirect into the
 * `/store` brand filter — see `collectionRedirectUrl` for the exact join
 * (title is encoded verbatim, never normalized). An unknown handle (or a
 * collection with no title) falls back to the unfiltered `/store`.
 *
 * `permanentRedirect` (308) — the route is permanently retired, matching the
 * `next.config.js` `permanent: true` 301s on the sibling `/categories/*`
 * rules. A server redirect (not a config rule) is required because the
 * destination needs the handle→brand-title lookup config can't do.
 */
export default async function CollectionPage({ params }: Props) {
  const { handle, countryCode } = await params
  const collection = await getCollectionByHandle(handle)

  permanentRedirect(collectionRedirectUrl(countryCode, collection))
}
