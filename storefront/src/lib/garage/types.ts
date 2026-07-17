export type FitWindow = { min: number; max: number } | null

/** One OEM-fitting tire spec: size + load index + speed rating (multi-axis fitment, WB-068). */
export type OemTire = { size: string; loadIndex: number | null; speedRating: string | null }

export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: FitWindow; widthWindow: FitWindow; offsetWindow: FitWindow
  oemTireSizes: string[]
  oemTires: OemTire[]
  // WB-113: holds the picked marketing SUB-MODEL string ("LE", "Base"),
  // not a wheel-size engine-modification hash slug — field name unrenamed,
  // mirrors the backend's own VehicleFitment.source.modificationSlug key.
  source: { modificationSlug: string; region: string }
}
export type Vehicle = {
  id: string
  year: number
  make: string
  model: string
  trim?: string
  // WB-113: the picked marketing sub-model string ("LE", "XLE", "Base"),
  // sent back as `sub_model` on re-resolve. Field name unrenamed (mirrors
  // VehicleFitment.source.modificationSlug above) — a vehicle saved BEFORE
  // this feature shipped holds an old engine-modification slug here
  // instead; see lib/garage/sub-model.ts's normalizeStoredSubModel.
  modificationSlug?: string
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number
  diameterWindow?: FitWindow; widthWindow?: FitWindow; offsetWindow?: FitWindow
  oemTireSizes?: string[]
  oemTires?: OemTire[]
  fitmentStatus?: "ok" | "not_found"
  notes?: string
  savedAt: string
}

export type NewVehicle = Omit<Vehicle, "id" | "savedAt">
