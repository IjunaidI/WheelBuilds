import { NewVehicle, Vehicle } from "./types"

export interface GarageProvider {
  list(): Vehicle[]
  add(v: NewVehicle): Vehicle
  update(id: string, patch: Partial<NewVehicle>): Vehicle
  remove(id: string): void
  setActive(id: string | null): void
  getActive(): Vehicle | null
  subscribe(listener: () => void): () => void
}
