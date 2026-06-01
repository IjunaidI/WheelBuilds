export type FitWindow = { min: number; max: number } | null
export type VehicleFitment = {
  status: "ok" | "not_found"
  canonicalBoltPatterns: string[]
  hubBoreMm: number | null
  diameterWindow: FitWindow; widthWindow: FitWindow; offsetWindow: FitWindow
  source: { modificationSlug: string; region: string }
}
export type Vehicle = {
  id: string
  year: number
  make: string
  model: string
  trim?: string
  modificationSlug?: string
  canonicalBoltPatterns?: string[]
  hubBoreMm?: number
  diameterWindow?: FitWindow; widthWindow?: FitWindow; offsetWindow?: FitWindow
  fitmentStatus?: "ok" | "not_found"
  notes?: string
  savedAt: string
}

export type NewVehicle = Omit<Vehicle, "id" | "savedAt">
