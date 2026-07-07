"use client"

import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { garage } from "./index"
import { onGarageError } from "./medusa-garage"
import { Vehicle, NewVehicle } from "./types"

// Wire garage write-failures to a toast once, at module scope rather than
// inside the hook body (WB-073 G5). useGarage() is called from several
// components at once (Nav, GaragePane, ...) — subscribing per-hook-instance
// would fire one toast per mounted consumer for the SAME failure. The
// module only ever evaluates this once per page load. Guarded by
// `typeof window` because "use client" modules still execute at module
// scope during SSR (client components are rendered server-side for the
// initial HTML before hydration) — same guard MedusaGarage/RoutingGarage
// already use for their own client-only startup work.
if (typeof window !== "undefined") {
  onGarageError((message) => toast.error(message))
}

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
