import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import { LocalStorageGarage } from "./local-storage-garage"
import { MedusaGarage } from "./medusa-garage"
import { getCustomer } from "@lib/data/customer" // returns the customer or null (NOT "retrieveCustomer")
import { planMerge } from "./merge"

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
      await this.remote.ready()                       // wait for the account to load before merging
      if (!this.merged && this.remote.isLoaded()) {
        this.merged = await this.mergeLocalIntoRemote() // retry on a later syncAuth if the merge failed
      }
      this.current = this.remote
    } else {
      this.current = this.local
      this.merged = false
    }
    this.emit()
  }

  private async mergeLocalIntoRemote(): Promise<boolean> {
    if (!this.remote) return false
    const toAdd = planMerge(this.local.list(), this.remote.list(), this.remote.isLoaded())
    const ok = await this.remote.mergeFrom(toAdd) // ONE idempotent request; false on failure
    if (ok) this.local.clear()                    // drop local ONLY after the merge persisted
    return ok
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
