"use client"

import { useSyncExternalStore } from "react"
import { TireFitSpec } from "@lib/fitment/tire-fits-vehicle"

// The tire PDP's currently-selected size, as a fit spec (size + load + speed).
// The hero owns the size selection but the fitment section (further down the
// page, a sibling component) needs it to keep its "Fits your car" band honest
// per selection — so the hero publishes here and the fitment band subscribes.
// Only one tire PDP is ever mounted, so a single module-level value is safe;
// same zero-dependency pattern as fitment-context / search-store. The hero
// resets it to null on unmount.
let selected: TireFitSpec | null = null
const listeners = new Set<() => void>()

const sameSpec = (a: TireFitSpec | null, b: TireFitSpec | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.size === b.size &&
    a.loadIndex === b.loadIndex &&
    a.speedRating === b.speedRating)

export const setSelectedTireFit = (spec: TireFitSpec | null) => {
  if (sameSpec(spec, selected)) return
  selected = spec
  listeners.forEach((l) => l())
}

export const getSelectedTireFit = (): TireFitSpec | null => selected

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSelectedTireFit = () =>
  useSyncExternalStore(
    subscribe,
    () => selected,
    () => null as TireFitSpec | null
  )
