// backend/src/modules/wheel-size/types.ts
export type Window = { min: number; max: number } | null

export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: Window
  widthWindow: Window
  offsetWindow: Window
  source: { modificationSlug: string; region: string }
}

// Minimal shape of the v2 by_model response we read (see Task-1 findings for the authoritative paths).
export type RawRim = { rim_diameter: number | null; rim_width: number | null; rim_offset: number | null }
export type RawWheelEntry = { is_stock: boolean; front?: RawRim | null; rear?: RawRim | null }
export type RawTechnical = { bolt_pattern?: string; pcd?: number; stud_holes?: number; centre_bore?: number }
export type RawByModelEntry = { technical?: RawTechnical; centre_bore?: number; wheels?: RawWheelEntry[] }
export type RawByModel = { data?: RawByModelEntry[] }
