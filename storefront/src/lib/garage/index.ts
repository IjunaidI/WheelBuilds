import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import { LocalStorageGarage } from "./local-storage-garage"
import { MedusaGarage } from "./medusa-garage"
import { getCustomer } from "@lib/data/customer" // returns the customer or null (NOT "retrieveCustomer")
import { vehiclesToMerge } from "./merge"

class RoutingGarage implements GarageProvider {
  private local = new LocalStorageGarage()
  private remote: MedusaGarage | null = null
  private current: GarageProvider = this.local
  private listeners = new Set<() => void>()
  private merged = false

  constructor() { if (typeof window !== "undefined") void this.syncAuth() }

  private emit() { this.listeners.forEach((l) => l()) }

  /** Called on boot and after the login/logout Server Actions complete. */
  async syncAuth(): Promise<void> {
    let authed = false
    try { authed = !!(await getCustomer()) } catch { authed = false }
    if (authed) {
      if (!this.remote) this.remote = new MedusaGarage()
      if (!this.merged) { await this.mergeLocalIntoRemote(); this.merged = true }
      this.current = this.remote
    } else {
      this.current = this.local
      this.merged = false
    }
    this.emit()
  }

  private async mergeLocalIntoRemote() {
    if (!this.remote) return
    const toAdd = vehiclesToMerge(this.local.list(), this.remote.list()) // pure, unit-tested (Task 19 Step 0)
    for (const nv of toAdd) this.remote.add(nv) // re-add through remote (mints client_id; idempotent server-side)
    this.local.clear() // clear() added to LocalStorageGarage in Step 2
  }

  list() { return this.current.list() }
  add(v: NewVehicle) { return this.current.add(v) }
  update(id: string, patch: Partial<NewVehicle>) { return this.current.update(id, patch) }
  remove(id: string) { return this.current.remove(id) }
  setActive(id: string | null) { return this.current.setActive(id) }
  getActive() { return this.current.getActive() }
  subscribe(l: () => void) {
    const offCur = this.current.subscribe(l)
    this.listeners.add(l)
    return () => { offCur(); this.listeners.delete(l) }
  }
}

export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
