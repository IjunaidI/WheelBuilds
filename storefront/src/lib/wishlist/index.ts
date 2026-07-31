"use client"

import { useSyncExternalStore } from "react"

import {
  addItem,
  hasItem,
  removeItem,
  sanitize,
  toggleItem,
  type WishlistItem,
} from "./wishlist-core"

/**
 * Guest wishlist, stored in the browser (WB-125).
 *
 * Follows the `lib/stores/*` pattern exactly (module state + listener set +
 * `useSyncExternalStore`), and the same localStorage-for-guests decision the
 * vehicle garage already makes (`lib/garage/single-vehicle-garage.ts`) — this
 * codebase has settled that shoppers act as guests, so requiring an account to
 * save a wheel would repeat the mistake WB-076 retired.
 *
 * ⚠️ KNOWN LIMITATION, stated rather than hidden: this is per-browser. It does
 * not follow a shopper to another device and is lost if they clear site data.
 * Account-backed sync is WB-127. Nothing in the UI may imply otherwise — the
 * bug being fixed here is precisely a toast that claimed "find it in your
 * account later" when no account wishlist existed at all.
 *
 * Don't read `localStorage` for the wishlist anywhere else; go through this
 * module, same rule as the garage.
 */

const STORAGE_KEY = "wishlist:v1"

const hasWindow = () => typeof window !== "undefined"

const read = (): WishlistItem[] => {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : []
  } catch {
    // Corrupt or unavailable storage (private mode, quota) must never break
    // the PDP — an empty wishlist is a fine degraded state.
    return []
  }
}

const write = (next: WishlistItem[]): void => {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota exceeded — the in-memory snapshot below still reflects the click,
    // so the UI stays consistent for this session.
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (hasWindow()) {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cachedSnapshot = null
      emit()
    }
  })
}

let cachedSnapshot: WishlistItem[] | null = null

const getSnapshot = (): WishlistItem[] => {
  if (cachedSnapshot) return cachedSnapshot
  cachedSnapshot = read()
  return cachedSnapshot
}

const EMPTY: WishlistItem[] = []
const getServerSnapshot = (): WishlistItem[] => EMPTY

const commit = (next: WishlistItem[]) => {
  write(next)
  cachedSnapshot = next
  emit()
}

/** Saves the item; returns true when it was added, false when removed. */
export const toggleWishlist = (item: WishlistItem): boolean => {
  const { list, saved } = toggleItem(getSnapshot(), item)
  commit(list)
  return saved
}

export const addToWishlist = (item: WishlistItem) => commit(addItem(getSnapshot(), item))
export const removeFromWishlist = (handle: string) =>
  commit(removeItem(getSnapshot(), handle))
export const clearWishlist = () => commit([])

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useWishlist = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

/** Whether a handle is saved. Re-renders with the list. */
export const useIsWishlisted = (handle: string): boolean =>
  hasItem(useWishlist(), handle)

export type { WishlistItem }
