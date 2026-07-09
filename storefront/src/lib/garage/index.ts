import type { GarageProvider } from "./provider"
import { SingleVehicleGarage } from "./single-vehicle-garage"

// GARAGE-DISABLED (WB-076, 2026-07-09): the account-backed garage is retired —
// shoppers pick their car as guests, so the multi-vehicle garage (account DB
// sync, login merge, saved-vehicles UI) is mothballed. The singleton was:
//
//   export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()
//
// RoutingGarage (localStorage ⇄ Medusa account sync + login merge) lives on in
// ./routing-garage.ts, compiled and unit-tested but outside the app import
// graph. Today the cache holds exactly ONE vehicle — guest or logged in — and
// every fitment consumer reads it through the unchanged useGarage() hook. To
// restore the garage, swap the export back and re-enable every GARAGE-DISABLED
// seam (grep the marker).
export const garage: GarageProvider = new SingleVehicleGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
