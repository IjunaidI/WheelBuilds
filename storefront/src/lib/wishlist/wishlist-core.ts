/**
 * Pure wishlist list-operations (WB-125).
 *
 * Split from the store so the rules are testable without `localStorage` or
 * React — the same split `lib/stores/*` uses for its snapshot logic.
 */

export type WishlistItem = {
  handle: string
  /** Product title at save time — shown if the product later 404s. */
  name: string
  brand: string
  /** Integer cents at save time. Display only; the PDP is authoritative. */
  priceCents: number
  thumbnail: string | null
  /** "wheel" | "tire" — so the page can label and link correctly. */
  kind: "wheel" | "tire"
  /** ISO timestamp; newest first in the list. */
  savedAt: string
}

/** Cap so a runaway click can't blow the localStorage quota. */
export const MAX_WISHLIST = 100

/** Keeps only well-formed entries — tolerates hand-edited/corrupt storage. */
export function sanitize(raw: unknown): WishlistItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (i): i is WishlistItem =>
      !!i &&
      typeof i === "object" &&
      typeof (i as WishlistItem).handle === "string" &&
      (i as WishlistItem).handle.length > 0
  )
}

/**
 * Adds (or refreshes) an item, newest first, deduped by handle and capped.
 *
 * Re-saving an existing handle moves it to the front and refreshes its
 * snapshot rather than duplicating — a shopper re-clicking the heart should
 * not silently create a second row.
 */
export function addItem(list: WishlistItem[], item: WishlistItem): WishlistItem[] {
  return [item, ...list.filter((i) => i.handle !== item.handle)].slice(0, MAX_WISHLIST)
}

export function removeItem(list: WishlistItem[], handle: string): WishlistItem[] {
  return list.filter((i) => i.handle !== handle)
}

export function hasItem(list: WishlistItem[], handle: string): boolean {
  return list.some((i) => i.handle === handle)
}

/** Toggle, returning the new list and what just happened (drives the toast). */
export function toggleItem(
  list: WishlistItem[],
  item: WishlistItem
): { list: WishlistItem[]; saved: boolean } {
  return hasItem(list, item.handle)
    ? { list: removeItem(list, item.handle), saved: false }
    : { list: addItem(list, item), saved: true }
}
