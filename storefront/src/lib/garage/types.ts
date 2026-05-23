export type Vehicle = {
  id: string
  year: number
  make: string
  model: string
  trim?: string
  /** Fitment fields — empty today, populated once 2.1 (wheel-size.com) lands. */
  boltPattern?: string
  hubBore?: string
  /** Free-form user note: stock, 2.5" lift, etc. */
  notes?: string
  savedAt: string
}

export type NewVehicle = Omit<Vehicle, "id" | "savedAt">
