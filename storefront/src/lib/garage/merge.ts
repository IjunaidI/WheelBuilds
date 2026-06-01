import type { Vehicle, NewVehicle } from "./types"
const key = (v: { year: number; make: string; model: string; trim?: string }) =>
  `${v.year}|${v.make}|${v.model}|${v.trim ?? ""}`.toLowerCase()
/** The local vehicles NOT already in the account, as NewVehicle (id/savedAt stripped). */
export function vehiclesToMerge(local: Vehicle[], remote: Vehicle[]): NewVehicle[] {
  if (!local.length) return []
  const seen = new Set(remote.map(key))
  return local.filter((v) => !seen.has(key(v))).map(({ id, savedAt, ...nv }) => nv as NewVehicle)
}

/**
 * Decide which local vehicles to push into the account on login. Returns []
 * unless the remote garage's initial load succeeded — merging against an
 * unread account would re-add everything under fresh client_ids and duplicate
 * rows that the (customer_id, client_id) guard cannot catch.
 */
export function planMerge(local: Vehicle[], remote: Vehicle[], loadOk: boolean): NewVehicle[] {
  if (!loadOk) return []
  return vehiclesToMerge(local, remote)
}
