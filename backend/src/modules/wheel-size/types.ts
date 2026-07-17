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
     * True when a sub-model (or the legacy modificationSlug alias) was
     * requested AND it matched at least one `by_model` entry's `trim_levels`
     * directly. False when one was requested but matched NOTHING, so the
     * service fell back to ALL entries for this vehicle instead of resolving
     * nothing (WB-113; this replaces WB-104 T3's old modification-narrowing
     * fallback, same operator-visibility rule) — always logged via
     * `logger.warn` (`service.ts`'s `fitmentForSubModel`), never silent.
     * Undefined when no sub-model was supplied at all, or it was "Base"
     * (`filterEntriesBySubModel`'s own no-narrow case).
     *
     * WB-113: unlike the old modification-narrowing fallback, this IS
     * reconstructable on a warm cache-hit — the fitment cache stores the raw
     * (unfiltered) `by_model` body, so `fitmentForSubModel` re-derives
     * `trimNarrowed` by re-running the same filter at read time, not just on
     * a fresh fetch.
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
