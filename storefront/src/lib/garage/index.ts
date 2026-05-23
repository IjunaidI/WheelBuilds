import { LocalStorageGarage } from "./local-storage-garage"
import { GarageProvider } from "./provider"

/**
 * Default garage provider. Swap to a Medusa-backed implementation once
 * Phase 2.2 (customer_vehicle table) ships — only this line should change.
 */
export const garage: GarageProvider = new LocalStorageGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
