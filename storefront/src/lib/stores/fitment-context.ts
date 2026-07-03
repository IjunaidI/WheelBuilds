"use client"

import { useSyncExternalStore } from "react"

type FitmentTarget = "wheels" | "tires"

// Which product surface the shopper is currently on. Tire surfaces (/tires, a tire
// PDP) set this to "tires" on mount and reset to "wheels" on unmount, so the
// find-by-vehicle drawer can default its Wheels|Tires destination toggle to match
// where the shopper is. Same zero-dependency pattern as search-store.
let context: FitmentTarget = "wheels"
const listeners = new Set<() => void>()

export const setFitmentContext = (t: FitmentTarget) => {
  if (t === context) return
  context = t
  listeners.forEach((l) => l())
}

export const getFitmentContext = (): FitmentTarget => context

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useFitmentContext = () =>
  useSyncExternalStore(
    subscribe,
    () => context,
    () => "wheels" as FitmentTarget
  )
