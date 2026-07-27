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
    // super.remove, NOT this.remove: the override below deliberately empties
    // the whole cache, which here would also delete the vehicle just added.
    // This call site only wants to prune the specific superseded rows.
    previousIds.forEach((id) => super.remove(id))
    this.setActive(vehicle.id)
    return vehicle
  }

  /**
   * Clearing the current vehicle must leave NO vehicle.
   *
   * `LocalStorageGarage.remove()` promotes the first survivor
   * (`writeActiveId(next[0]?.id ?? null)`) when it removes the active one —
   * correct for a multi-vehicle garage, wrong under this contract. Whenever
   * the stored list still holds more than one row, "clear my car" silently
   * swapped in an older one instead of clearing: pick vehicle 1, pick
   * vehicle 2, clear vehicle 2, and vehicle 1 comes back as active. A list
   * longer than one is reachable from a pre-WB-076 legacy multi-vehicle
   * cache that no `add()` has collapsed yet (add() is the only thing that
   * enforces the invariant, so a returning shopper who clears before ever
   * picking a new car hits exactly this).
   *
   * Rather than depend on the list already being short, make removal total:
   * drop the requested row, drop any straggler, and clear the active
   * pointer. Under the single-vehicle contract these are the same operation.
   */
  remove(id: string): void {
    super.remove(id)
    for (const straggler of this.list()) {
      super.remove(straggler.id)
    }
    this.setActive(null)
  }
}
