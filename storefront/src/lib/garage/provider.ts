import { NewVehicle, Vehicle } from "./types"

export interface GarageProvider {
  list(): Vehicle[]
  add(v: NewVehicle): Vehicle
  update(id: string, patch: Partial<NewVehicle>): Vehicle
  remove(id: string): void
  setActive(id: string | null): void
  getActive(): Vehicle | null
  subscribe(listener: () => void): () => void
  /**
   * Load-state signal (WB-073 G6) — lets a consumer distinguish "the initial
   * load failed" from "the load succeeded and there's genuinely nothing
   * here." Optional + additive so it doesn't break providers written before
   * this signal existed: a provider that omits it is treated as always-ready
   * by every reader in this codebase (`?? true`), never as a load failure.
   * `MedusaGarage` is the only provider with a real async load; it's false
   * while loading AND after a failed load — pair with `loadError()` to tell
   * those two apart. `LocalStorageGarage`'s load is synchronous, so it
   * reports true immediately.
   */
  isLoaded?(): boolean
  /**
   * Non-null exactly when the most recent load attempt failed; null while
   * loading, after a successful load, or for a provider with no load state
   * at all. Kept as a separate method (rather than folding into isLoaded())
   * so "still loading" and "load failed" — both `isLoaded() === false` —
   * remain distinguishable by whoever reads this signal.
   */
  loadError?(): string | null
  /** Re-attempts a failed load (the "Retry" affordance). No-op default for providers without a load to retry. */
  retryLoad?(): void
}
