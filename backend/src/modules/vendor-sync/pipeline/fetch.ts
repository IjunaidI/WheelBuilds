import { VendorAdapter, VendorFeedDescriptor } from '../adapters/types'

/**
 * Fetch a vendor feed using the adapter.
 */
export async function fetchFeed(adapter: VendorAdapter): Promise<VendorFeedDescriptor> {
  return adapter.fetch()
}
