// backend/src/modules/wheel-size/types.ts
export type Window = { min: number; max: number } | null

export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: Window
  widthWindow: Window
  offsetWindow: Window
  /** Factory (is_stock) tire sizes for the vehicle, canonical (e.g. "225/55R18"). */
  oemTireSizes: string[]
  /** Factory (is_stock) tires for the vehicle: canonical size + load index + speed rating. Superset of oemTireSizes. */
  oemTires: OemTire[]
  source: {
    modificationSlug: string
    region: string
    /**
     * True when a modificationSlug was supplied AND the trim-narrowed query
     * returned data directly. False when a modificationSlug was supplied but
     * `resolveByModel` discarded it and retried broad (all trims) because the
     * trim-narrowed query returned no data (WB-104 T3) — the storefront's trim
     * dropdown is the GLOBAL modifications catalog, so a non-US trim slug against
     * a `usdm` fitment query is a common cause. That fallback is logged (visible
     * in ops logs via `resolveByModel`'s `logger.warn`) and surfaced here on the
     * live-resolve response. Undefined when no trim was supplied at all, OR
     * when this value is being read back off a warm cache-hit (`toFitment`)
     * rather than a live resolve/refresh — WB-104 T3: this flag is
     * first-fetch/refresh-only, it is not persisted on the cache row, so a
     * later cache-hit read cannot reconstruct it. The `logger.warn` above is
     * the authoritative signal that a silent trim-fallback occurred.
     */
    trimNarrowed?: boolean
  }
}

/** A single factory tire fitment: canonical size, load index, and speed rating (null when absent). */
export type OemTire = { size: string; loadIndex: number | null; speedRating: string | null }

// Minimal shape of the v2 by_model response we read (see Task-1 findings for the authoritative paths).
export type RawRim = {
  rim_diameter: number | null
  rim_width: number | null
  rim_offset: number | null
  tire?: string | null
  load_index?: number | null
  speed_index?: string | null
}
export type RawWheelEntry = { is_stock: boolean; front?: RawRim | null; rear?: RawRim | null }
export type RawTechnical = { bolt_pattern?: string; pcd?: number; stud_holes?: number; centre_bore?: number | string }
// trim_levels (WB-113): the marketing sub-model list (e.g. ["L","LE","XLE"] on
// a Corolla), ALONGSIDE the existing engine "modification"/trim ("1.8i") this
// entry already carries. Many-to-one with an entry (one engine entry can list
// several sub-models) AND the same sub-model can appear on multiple entries
// (e.g. a truck's "LT" spanning a gas AND a diesel engine entry) — see
// `sub-models.ts` for the two pure fns that reconcile both directions.
export type RawByModelEntry = {
  technical?: RawTechnical
  centre_bore?: number | string
  wheels?: RawWheelEntry[]
  trim_levels?: string[]
}
export type RawByModel = { data?: RawByModelEntry[] }

// /modifications entry shape (the engine/trim catalog behind `client.ts`'s
// `modifications()` — distinct from the by_model response above). Not
// exhaustive: the live v2 payload also carries `generation`, `body`, `engine`,
// etc. that no current caller reads; only the fields callers actually consume
// plus this task's `trim_levels` addition are declared.
export type RawModificationEntry = {
  slug?: string
  name?: string
  trim?: string
  trim_levels?: string[]
}
export type RawModifications = { data?: RawModificationEntry[] }

export type ReverseFitmentVehicle = {
  year: string
  make: string
  model: string
  trim?: string
  /** True when the cached row's `raw.data` had exactly one entry — i.e. `trim`
   * (when present) identifies a single specific trim rather than a value that
   * happened to be shared across every trim in a multi-trim union row. */
  trimNarrowed: boolean
  boltPattern: string
}

export type ReverseTireFitmentVehicle = {
  year: string
  make: string
  model: string
  trim?: string
  /** See `ReverseFitmentVehicle.trimNarrowed`. */
  trimNarrowed: boolean
  /** The matched canonical OEM tire size, e.g. "225/55R18". */
  size: string
}
