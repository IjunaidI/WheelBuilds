import type { GarageProvider } from "./provider"
import type { Vehicle, NewVehicle } from "./types"
import { LocalStorageGarage } from "./local-storage-garage"
import { MedusaGarage } from "./medusa-garage"
import { getCustomer } from "@lib/data/customer" // returns the customer or null (NOT "retrieveCustomer")
import { planMerge } from "./merge"

/**
 * Structural surface RoutingGarage needs from its "remote" provider, beyond
 * the shared GarageProvider contract: readiness + load-success + the merge
 * entry point. MedusaGarage satisfies this by construction (default below);
 * tests inject a fake implementing the same surface — this is the seam that
 * makes the customer-identity lifecycle (WB-073 G1/G2) unit-testable without
 * a real MedusaGarage/network.
 */
type RemoteGarage = GarageProvider & {
  ready(): Promise<void>
  isLoaded(): boolean
  mergeFrom(vehicles: Vehicle[]): Promise<boolean>
}

export class RoutingGarage implements GarageProvider {
  private local = new LocalStorageGarage()
  private remote: RemoteGarage | null = null
  // Customer id the current `remote` was built for (null == no remote / logged
  // out). Comparing against this on every syncAuth — instead of a plain
  // authed boolean — is what makes a login-as-a-different-customer rebuild
  // `remote` from scratch rather than keep showing the previous customer's
  // garage (WB-073 G2).
  private remoteCustomerId: string | null = null
  private current: GarageProvider = this.local
  // Every actively-subscribed listener, paired with its unsubscribe from
  // whichever provider it is CURRENTLY bound to. `subscribe` binds directly
  // to `current` for low overhead; when an auth swap re-points `current`,
  // `setCurrent` walks this map and rebinds each listener onto the new
  // provider so mutations made AFTER the swap still reach components that
  // subscribed BEFORE it (WB-073 G1 — previously they'd go stale, still
  // wired to the abandoned provider).
  private listenerBindings = new Map<() => void, () => void>()
  private merged = false
  private createRemote: () => RemoteGarage

  constructor(createRemote: () => RemoteGarage = () => new MedusaGarage()) {
    this.createRemote = createRemote
    if (typeof window !== "undefined") void this.syncAuth()
  }

  private emit() { this.listenerBindings.forEach((_off, listener) => listener()) }

  private setCurrent(next: GarageProvider) {
    if (this.current === next) return
    this.current = next
    // tsconfig targets es5 without downlevelIteration, so iterate via
    // forEach rather than for..of (Map isn't spec-iterable at that target).
    // Rebinding an EXISTING key's value mid-forEach is well-defined and does
    // not add or skip entries.
    this.listenerBindings.forEach((off, listener) => {
      off() // unsubscribe from the old provider
      this.listenerBindings.set(listener, next.subscribe(listener)) // rebind onto the new one
    })
  }

  /** Called on boot and after the login/logout Server Actions complete. */
  async syncAuth(): Promise<void> {
    let customerId: string | null = null
    try {
      const customer = await getCustomer()
      customerId = customer?.id ?? null
    } catch { customerId = null }

    // Identity changed (fresh login, logout, or straight to a different
    // account): rebuild `remote` so the new customer never inherits state
    // built for someone else. Logging out nulls it so a later login always
    // gets a fresh instance instead of reusing a stale one.
    if (customerId !== this.remoteCustomerId) {
      this.remote = customerId ? this.createRemote() : null
      this.remoteCustomerId = customerId
      this.merged = false
    }

    if (customerId && this.remote) {
      await this.remote.ready()                       // wait for the account to load before merging
      if (!this.merged && this.remote.isLoaded()) {
        this.merged = await this.mergeLocalIntoRemote() // retry on a later syncAuth if the merge failed
      }
      this.setCurrent(this.remote)
    } else {
      this.merged = false
      this.setCurrent(this.local)
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
    this.listenerBindings.set(l, this.current.subscribe(l))
    return () => {
      this.listenerBindings.get(l)?.()
      this.listenerBindings.delete(l)
    }
  }
}

export const garage: GarageProvider & { syncAuth?: () => Promise<void> } = new RoutingGarage()

export type { Vehicle, NewVehicle } from "./types"
export type { GarageProvider } from "./provider"
