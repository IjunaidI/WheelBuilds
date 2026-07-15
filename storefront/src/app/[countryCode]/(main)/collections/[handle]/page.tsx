import { redirect } from "next/navigation"

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
 */
export default async function CollectionPage({ params }: Props) {
  const { handle, countryCode } = await params
  const collection = await getCollectionByHandle(handle)

  redirect(collectionRedirectUrl(countryCode, collection))
}
