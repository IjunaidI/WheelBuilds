"use client"

import { useSyncExternalStore } from "react"
import { garage } from "./index"
import { Vehicle, NewVehicle } from "./types"

type GarageSnapshot = {
  vehicles: Vehicle[]
  active: Vehicle | null
}

const EMPTY_SNAPSHOT: GarageSnapshot = { vehicles: [], active: null }

let cachedSnapshot: GarageSnapshot | null = null
let cachedSignature: string | null = null

const getSnapshot = (): GarageSnapshot => {
  const vehicles = garage.list()
  const active = garage.getActive()
  // Signature over the FULL vehicle content, not just ids. The garage reads
  // re-parse fresh objects from localStorage on every call, so this memo is
  // what gives useSyncExternalStore a stable reference between real changes —
  // but it must rebuild whenever ANY field changes, not only when a vehicle is
  // added or removed. The YMM flow adds a vehicle, then a moment later calls
  // update(id, { bolt patterns, diameter/width/offset windows }) with the SAME
  // id and count once the async wheel-size lookup resolves. A shallow
  // id/length check treats that as "unchanged" and returns the stale
  // (window-less) snapshot, so the fitment never reaches React until a refresh
  // or car-switch — which is exactly the "windows only show up on refresh" bug.
  const signature = JSON.stringify({ active: active?.id ?? null, vehicles })
  if (cachedSnapshot && cachedSignature === signature) {
    return cachedSnapshot
  }
  cachedSignature = signature
  cachedSnapshot = { vehicles, active }
  return cachedSnapshot
}

const getServerSnapshot = (): GarageSnapshot => EMPTY_SNAPSHOT

const subscribe = (listener: () => void) => garage.subscribe(listener)

export const useGarage = () => {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  return {
    vehicles: snapshot.vehicles,
    active: snapshot.active,
    add: (v: NewVehicle) => garage.add(v),
    update: (id: string, patch: Partial<NewVehicle>) => garage.update(id, patch),
    remove: (id: string) => garage.remove(id),
    setActive: (id: string | null) => garage.setActive(id),
  }
}
