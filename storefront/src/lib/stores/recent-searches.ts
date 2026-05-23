"use client"

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "recent-searches"
const MAX_RECENT = 10

const hasWindow = () => typeof window !== "undefined"

const read = (): string[] => {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : []
  } catch {
    return []
  }
}

const write = (next: string[]): void => {
  if (!hasWindow()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (hasWindow()) {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) emit()
  })
}

export const addRecentSearch = (query: string) => {
  const trimmed = query.trim()
  if (!trimmed) return
  const current = read()
  const next = [trimmed, ...current.filter((q) => q !== trimmed)].slice(
    0,
    MAX_RECENT
  )
  write(next)
  emit()
}

export const clearRecentSearches = () => {
  write([])
  emit()
}

let cachedSnapshot: string[] | null = null

const getSnapshot = (): string[] => {
  const next = read()
  if (
    cachedSnapshot &&
    cachedSnapshot.length === next.length &&
    cachedSnapshot.every((v, i) => v === next[i])
  ) {
    return cachedSnapshot
  }
  cachedSnapshot = next
  return cachedSnapshot
}

const EMPTY: string[] = []
const getServerSnapshot = (): string[] => EMPTY

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useRecentSearches = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
