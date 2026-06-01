import type { Vehicle, NewVehicle } from "./types"
const key = (v: { year: number; make: string; model: string; trim?: string }) =>
  `${v.year}|${v.make}|${v.model}|${v.trim ?? ""}`.toLowerCase()
/** The local vehicles NOT already in the account, as NewVehicle (id/savedAt stripped). */
export function vehiclesToMerge(local: Vehicle[], remote: Vehicle[]): NewVehicle[] {
  if (!local.length) return []
  const seen = new Set(remote.map(key))
  return local.filter((v) => !seen.has(key(v))).map(({ id, savedAt, ...nv }) => nv as NewVehicle)
}
