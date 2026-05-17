import { z } from 'zod'

/**
 * Zod schema for validating raw CSV row fields before normalization.
 */
export const wheelRawRowSchema = z.object({
  PartNumber: z.string().min(1, 'PartNumber is required'),
  PartDescription: z.string().min(1, 'PartDescription is required'),
  Brand: z.string().min(1, 'Brand is required'),
  DisplayStyleNo: z.string(),
  Finish: z.string(),
  Size: z.string().min(1, 'Size is required'),
  BoltPattern: z.string().min(1, 'BoltPattern is required'),
  Offset: z.string(),
  CenterBore: z.string(),
  LoadRating: z.string(),
  ShippingWeight: z.string(),
  ImageURL: z.string(),
  InvOrderType: z.string().min(1, 'InvOrderType is required'),
  Style: z.string(),
  TotalQOH: z.string(),
  MSRP_USD: z.string(),
  MAP_USD: z.string(),
  RunDate: z.string().min(1, 'RunDate is required'),
})

/**
 * Zod schema for validating a WheelNormalizedRecord after normalization.
 */
export const wheelNormalizedSchema = z.object({
  productType: z.literal('wheel'),
  partNumber: z.string().min(1),
  vendorCode: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  imageUrl: z.string().nullable(),
  invOrderType: z.string().min(1),
  totalQoh: z.number().int().min(0),
  msrpUsd: z.number().min(0),
  mapUsd: z.number().min(0),
  runDateVendor: z.date(),
  stockByWarehouse: z.record(z.string(), z.number().int().min(0)),
  displayStyleNo: z.string().nullable(),
  finish: z.string().nullable(),
  diameterIn: z.number().positive(),
  widthIn: z.number().positive(),
  boltCount: z.number().int().positive().nullable(),
  boltCircleIn: z.number().positive().nullable(),
  boltPatternRaw: z.string(),
  offsetMm: z.number(),
  centerBoreMm: z.number().nullable(),
  loadRatingLb: z.number().nullable(),
  shippingWeightLb: z.number().nullable(),
  style: z.string().nullable(),
})
