import { Metadata } from "next"

import WishlistTemplate from "@modules/wishlist/templates"

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Wheels and tires you've saved.",
  // Browser-local and per-visitor, so there is nothing here worth indexing.
  robots: { index: false, follow: true },
}

/**
 * Saved items (WB-125). Guest-first: the list lives in the shopper's browser,
 * so this route needs no auth and fetches nothing server-side.
 */
export default function WishlistPage() {
  return <WishlistTemplate />
}
