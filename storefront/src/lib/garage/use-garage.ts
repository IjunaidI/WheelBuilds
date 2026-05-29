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

const getSnapshot = (): GarageSnapshot => {
  const vehicles = garage.list()
  const active = garage.getActive()
  if (
    cachedSnapshot &&
    cachedSnapshot.active?.id === active?.id &&
    cachedSnapshot.vehicles.length === vehicles.length &&
    cachedSnapshot.vehicles.every((v, i) => v.id === vehicles[i]?.id)
  ) {
    return cachedSnapshot
  }
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
    remove: (id: string) => garage.remove(id),
    setActive: (id: string | null) => garage.setActive(id),
  }
}
