import { z } from "zod"

/**
 * Body accepted by POST /store/customer/vehicles. `is_active` is deliberately
 * NOT a field: vehicles are always created inactive and made active only via
 * POST .../[id]/activate, which keeps the single-active invariant intact.
 */
export const VehicleCreateSchema = z.object({
  client_id: z.string().min(1),
  year: z.number().int().gte(1900).lte(2100),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().nullish(),
  modificationSlug: z.string().nullish(),
  canonicalBoltPatterns: z.array(z.string()).nullish(),
  hubBoreMm: z.number().nullish(),
  diameterWindow: z.any().nullish(),
  widthWindow: z.any().nullish(),
  offsetWindow: z.any().nullish(),
  fitmentStatus: z.string().nullish(),
  notes: z.string().nullish(),
})

export type VehicleCreateInput = z.infer<typeof VehicleCreateSchema>

export type ParseResult =
  | { ok: true; data: VehicleCreateInput }
  | { ok: false; error: string }

export function parseVehicleCreate(body: unknown): ParseResult {
  const r = VehicleCreateSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}

export const VehicleMergeSchema = z.object({
  vehicles: z.array(VehicleCreateSchema),
})

export type VehicleMergeInput = z.infer<typeof VehicleMergeSchema>

export type MergeParseResult =
  | { ok: true; data: VehicleMergeInput }
  | { ok: false; error: string }

export function parseVehicleMerge(body: unknown): MergeParseResult {
  const r = VehicleMergeSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}
