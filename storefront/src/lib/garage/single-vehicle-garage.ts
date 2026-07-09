import { LocalStorageGarage } from "./local-storage-garage"
import type { NewVehicle, Vehicle } from "./types"

/**
 * GARAGE-DISABLED (WB-076): the garage (multi-vehicle list + account sync)
 * is retired. This provider enforces the replacement contract — the
 * localStorage cache holds AT MOST ONE vehicle, always the active one.
 * add() replaces whatever was stored (the first add after deploy collapses
 * any legacy multi-vehicle list). Same storage keys as LocalStorageGarage,
 * so pre-existing active vehicles survive the cutover. To restore the full
 * garage, follow the GARAGE-DISABLED seams listed in
 * docs/done/specs/2026-07-09-retire-garage-single-vehicle-design.md.
 */
export class SingleVehicleGarage extends LocalStorageGarage {
  add(v: NewVehicle): Vehicle {
    const previousIds = this.list().map((p) => p.id)
    const vehicle = super.add(v)
    previousIds.forEach((id) => this.remove(id))
    this.setActive(vehicle.id)
    return vehicle
  }
}
