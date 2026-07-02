import type { TireType } from "./classify-tire-type"

export type TireSpecs = {
  construction: string | null
  plyRating: string | null
  tireType: TireType
  weightLb: number
}

export type SpecRow = { label: string; value: string }

const TYPE_LABEL: Record<TireType, string> = {
  passenger: "Passenger",
  "light-truck": "Light truck",
  other: "Specialty",
}

/** Model-level tire spec rows. Zero/missing numerics + null strings omitted (WB-056 pattern). */
export function buildTireSpecRows(specs: TireSpecs): SpecRow[] {
  const rows: SpecRow[] = []
  rows.push({ label: "Type", value: TYPE_LABEL[specs.tireType] })
  if (specs.construction) rows.push({ label: "Construction", value: specs.construction })
  if (specs.plyRating) rows.push({ label: "Ply rating", value: specs.plyRating })
  if (specs.weightLb > 0) rows.push({ label: "Weight", value: `${specs.weightLb} lb` })
  return rows
}
