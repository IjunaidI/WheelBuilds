import { z } from 'zod'

/**
 * Zod schema for validating raw CSV row fields before normalization.
 */
export const tireRawRowSchema = z.object({
  Brand: z.string().min(1, 'Brand is required'),
  PartNumber: z.string().min(1, 'PartNumber is required'),
  PartDescription: z.string().min(1, 'PartDescription is required'),
  ManufacturerPartNumber: z.string(),
  ImageURL: z.string(),
  InvOrderType: z.string().min(1, 'InvOrderType is required'),
  TotalQOH: z.string(),
  MSRP_USD: z.string(),
  MAP_USD: z.string(),
  RunDate: z.string().min(1, 'RunDate is required'),
  Division: z.string(),
})

/**
 * Zod schema for validating a TireNormalizedRecord after normalization.
 */
export const tireNormalizedSchema = z.object({
  productType: z.literal('tire'),
  partNumber: z.string().min(1),
  vendorCode: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  imageUrl: z.string().nullable(),
  invOrderType: z.enum(['ST', 'N2', 'SO']),
  totalQoh: z.number().int().min(0),
  msrpUsd: z.number().min(0),
  mapUsd: z.number().min(0),
  runDateVendor: z.date(),
  stockByWarehouse: z.record(z.string(), z.number().int().min(0)),
  manufacturerPartNumber: z.string().nullable(),
  division: z.string().nullable(),
  tireWidthMm: z.number().nullable(),
  aspectRatio: z.number().nullable(),
  constructionType: z.string().nullable(),
  rimDiameterIn: z.number().nullable(),
  loadIndex: z.number().nullable(),
  speedRating: z.string().nullable(),
  plyRating: z.string().nullable(),
  tirePrefix: z.string().nullable(),
})
