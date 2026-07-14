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
     * a `usdm` fitment query is a common, previously-silent cause. Undefined when
     * no trim was supplied at all.
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
export type RawByModelEntry = { technical?: RawTechnical; centre_bore?: number | string; wheels?: RawWheelEntry[] }
export type RawByModel = { data?: RawByModelEntry[] }

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
