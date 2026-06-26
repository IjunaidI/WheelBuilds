import type { Vehicle } from "./types"
const key = (v: { year: number; make: string; model: string; trim?: string }) =>
  `${v.year}|${v.make}|${v.model}|${v.trim ?? ""}`.toLowerCase()

/**
 * The local vehicles NOT already in the account — as full Vehicles, so their
 * stable local id flows through as the merge client_id (idempotent across
 * retries: re-sending an already-persisted row hits the (customer_id,
 * client_id) guard instead of duplicating it).
 */
export function vehiclesToMerge(local: Vehicle[], remote: Vehicle[]): Vehicle[] {
  if (!local.length) return []
  const seen = new Set(remote.map(key))
  return local.filter((v) => !seen.has(key(v)))
}

/**
 * Decide which local vehicles to push into the account on login. Returns []
 * unless the remote garage's initial load succeeded — merging against an
 * unread account would re-add everything and duplicate rows.
 */
export function planMerge(local: Vehicle[], remote: Vehicle[], loadOk: boolean): Vehicle[] {
  if (!loadOk) return []
  return vehiclesToMerge(local, remote)
}
