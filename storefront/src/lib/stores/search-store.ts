"use client"

import { useSyncExternalStore } from "react"

let isOpen = false
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

export const openSearch = () => {
  if (isOpen) return
  isOpen = true
  emit()
}

export const closeSearch = () => {
  if (!isOpen) return
  isOpen = false
  emit()
}

export const toggleSearch = () => {
  isOpen = !isOpen
  emit()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => isOpen
const getServerSnapshot = () => false

export const useSearchOpen = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
