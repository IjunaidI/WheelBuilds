"use client"

import { useSyncExternalStore } from "react"
import { garage } from "./index"
import { Vehicle, NewVehicle } from "./types"

// GARAGE-DISABLED (WB-076): the write-failure toast channel below fed off
// MedusaGarage's network writes (WB-073 G5). The cache-only provider has no
// network writes, so the wiring is dormant — re-enable with the garage.
// import { toast } from "sonner"
// import { onGarageError } from "./medusa-garage"
//
// Wire garage write-failures to a toast once, at module scope rather than
// inside the hook body (WB-073 G5). useGarage() is called from several
// components at once (Nav, GaragePane, ...) — subscribing per-hook-instance
// would fire one toast per mounted consumer for the SAME failure. The
// module only ever evaluates this once per page load. Guarded by
// `typeof window` because "use client" modules still execute at module
// scope during SSR (client components are rendered server-side for the
// initial HTML before hydration) — same guard MedusaGarage/RoutingGarage
// already use for their own client-only startup work.
// if (typeof window !== "undefined") {
//   onGarageError((message) => toast.error(message))
// }

type GarageSnapshot = {
  vehicles: Vehicle[]
  active: Vehicle | null
  // Load-state signal (WB-073 G6) — see medusa-garage.ts's isLoaded()/
  // loadError() for the full contract. Included in the snapshot (and its
  // signature below) so a load transitioning loading -> error, or
  // error -> loading on retry, triggers a re-render even when `vehicles`
  // itself doesn't change (it stays [] through both states).
  isLoaded: boolean
  loadError: string | null
}

// Ready + empty is the correct SSR/pre-hydration default: MedusaGarage only
// starts its load on the client (`typeof window !== "undefined"` guard in
// its constructor), and the common case — a guest on LocalStorageGarage — is
// genuinely always ready. An authed visitor briefly sees this same "ready,
// empty" snapshot for one tick until the real client snapshot (isLoaded:
// false, loading) supersedes it post-hydration; that's the same one-tick
// gap every field in this snapshot already had before this signal existed.
const EMPTY_SNAPSHOT: GarageSnapshot = { vehicles: [], active: null, isLoaded: true, loadError: null }

let cachedSnapshot: GarageSnapshot | null = null
let cachedSignature: string | null = null

const getSnapshot = (): GarageSnapshot => {
  const vehicles = garage.list()
  const active = garage.getActive()
  const isLoaded = garage.isLoaded?.() ?? true
  const loadError = garage.loadError?.() ?? null
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
  const signature = JSON.stringify({ active: active?.id ?? null, vehicles, isLoaded, loadError })
  if (cachedSnapshot && cachedSignature === signature) {
    return cachedSnapshot
  }
  cachedSignature = signature
  cachedSnapshot = { vehicles, active, isLoaded, loadError }
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
    // isLoaded/loadError (WB-073 G6): lets a consumer render "loading" vs
    // "load failed" vs "genuinely empty" instead of collapsing all three
    // into "vehicles.length === 0". retryLoad() re-invokes the CURRENT
    // provider's load() — GarageManager's "Retry" button target.
    isLoaded: snapshot.isLoaded,
    loadError: snapshot.loadError,
    retryLoad: () => garage.retryLoad?.(),
    add: (v: NewVehicle) => garage.add(v),
    update: (id: string, patch: Partial<NewVehicle>) => garage.update(id, patch),
    remove: (id: string) => garage.remove(id),
    setActive: (id: string | null) => garage.setActive(id),
  }
}
