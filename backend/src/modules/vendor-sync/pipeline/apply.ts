import { MedusaContainer } from "@medusajs/framework/types"
import { ProductStatus } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"
import { NormalizedRecord } from "../adapters/types"
import { DiffResult } from "./diff"
import { buildProductMetadata } from "./build-metadata"
import {
  ensureUsRegion,
  ensureDefaultSalesChannel,
  ensureProductCategories,
  ensureBrandCollection,
  ensureShippingProfile,
} from "./bootstrap"
import VendorSyncService from "../service"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

export interface ApplyResult {
  processedCount: number
  errorCount: number
  errors: Array<{ partNumber: string; error: string }>
}

/**
 * Slugify a part number into a URL-safe handle.
 */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Apply the diff to Medusa: create new products and update changed ones.
 * Products are processed sequentially. Each product is wrapped in try/catch
 * so that a single failure does not abort the entire run.
 *
 * PR 4 scope: new + changed only (no stock, no discontinue).
 */
export async function applyChanges(
  container: MedusaContainer,
  service: VendorSyncService,
  runId: string,
  vendorCode: string,
  diffResult: DiffResult,
  logger: Logger
): Promise<ApplyResult> {
  const errors: Array<{ partNumber: string; error: string }> = []
  let processedCount = 0

  // 1. Bootstrap required Medusa entities
  logger.info(`[vendor-sync] [${runId}] Bootstrapping Medusa entities...`)
  const [_regionId, salesChannelId, categories, shippingProfileId] =
    await Promise.all([
      ensureUsRegion(container),
      ensureDefaultSalesChannel(container),
      ensureProductCategories(container),
      ensureShippingProfile(container),
    ])

  // Cache brand collections to avoid repeated lookups
  const brandCollectionCache = new Map<string, string>()

  async function getBrandCollectionId(brand: string): Promise<string> {
    const cached = brandCollectionCache.get(brand)
    if (cached) return cached
    const id = await ensureBrandCollection(container, brand)
    brandCollectionCache.set(brand, id)
    return id
  }

  function getCategoryId(productType: string): string {
    return productType === "wheel"
      ? categories.wheelsCategoryId
      : categories.tiresCategoryId
  }

  // 2. Process new products
  logger.info(
    `[vendor-sync] [${runId}] Creating ${diffResult.newPartNumbers.length} new products...`
  )
  for (const partNumber of diffResult.newPartNumbers) {
    try {
      // Read the normalized record from staging
      const [stagingRow] = await (service as any).listVendorFeedStagings(
        { run_id: runId, part_number: partNumber },
        { take: 1 }
      )
      if (!stagingRow) {
        throw new Error(`Staging row not found for part_number=${partNumber}`)
      }

      const normalized = stagingRow.normalized as NormalizedRecord
      const brandCollectionId = await getBrandCollectionId(normalized.brand)
      const categoryId = getCategoryId(normalized.productType)

      // Build weight (wheels only, convert lb to grams)
      const weight =
        normalized.productType === "wheel" && normalized.shippingWeightLb
          ? Math.round(normalized.shippingWeightLb * 453.592)
          : undefined

      // Create product via workflow
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: normalized.title,
              handle: slugify(normalized.partNumber),
              status: ProductStatus.PUBLISHED,
              thumbnail: normalized.imageUrl,
              images: normalized.imageUrl
                ? [{ url: normalized.imageUrl }]
                : [],
              weight,
              collection_id: brandCollectionId,
              category_ids: [categoryId],
              sales_channels: [{ id: salesChannelId }],
              shipping_profile_id: shippingProfileId,
              external_id: normalized.partNumber,
              metadata: buildProductMetadata(normalized),
              options: [{ title: "Default", values: ["Default"] }],
              variants: [
                {
                  title: "Default",
                  sku: normalized.partNumber,
                  options: { Default: "Default" },
                  manage_inventory: true,
                  allow_backorder: false,
                  prices: [
                    {
                      amount: Math.round(normalized.msrpUsd * 100),
                      currency_code: "usd",
                    },
                  ],
                },
              ],
            },
          ],
        },
      })

      // Extract ids from the result
      const product = result[0]
      const variant = product.variants?.[0]
      const inventoryItemId =
        (variant as any)?.inventory_items?.[0]?.inventory_item_id ?? null

      // Create vendor_product_current row
      await (service as any).createVendorProductCurrents({
        vendor_code: vendorCode,
        part_number: partNumber,
        content_hash: stagingRow.content_hash,
        medusa_product_id: product.id,
        medusa_variant_id: variant?.id ?? null,
        inventory_item_id: inventoryItemId,
        normalized: normalized,
        last_seen_run_id: runId,
        applied_at: new Date(),
        discontinued_at: null,
      })

      processedCount++
    } catch (err: any) {
      logger.error(
        `[vendor-sync] [${runId}] Error creating product for ${partNumber}: ${err.message}`
      )
      errors.push({ partNumber, error: err.message })
    }
  }

  // 3. Process changed products
  logger.info(
    `[vendor-sync] [${runId}] Updating ${diffResult.changedPartNumbers.length} changed products...`
  )
  for (const partNumber of diffResult.changedPartNumbers) {
    try {
      // Read the normalized record from staging
      const [stagingRow] = await (service as any).listVendorFeedStagings(
        { run_id: runId, part_number: partNumber },
        { take: 1 }
      )
      if (!stagingRow) {
        throw new Error(`Staging row not found for part_number=${partNumber}`)
      }

      // Read the existing current row
      const [currentRow] = await (service as any).listVendorProductCurrents(
        { vendor_code: vendorCode, part_number: partNumber },
        { take: 1 }
      )
      if (!currentRow || !currentRow.medusa_product_id) {
        throw new Error(
          `Current row or medusa_product_id not found for part_number=${partNumber}`
        )
      }

      const normalized = stagingRow.normalized as NormalizedRecord
      const categoryId = getCategoryId(normalized.productType)
      const brandCollectionId = await getBrandCollectionId(normalized.brand)

      const weight =
        normalized.productType === "wheel" && normalized.shippingWeightLb
          ? Math.round(normalized.shippingWeightLb * 453.592)
          : undefined

      // Update product via workflow
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: currentRow.medusa_product_id },
          update: {
            title: normalized.title,
            thumbnail: normalized.imageUrl,
            metadata: buildProductMetadata(normalized),
            weight,
            collection_id: brandCollectionId,
            category_ids: [categoryId],
            images: normalized.imageUrl
              ? [{ url: normalized.imageUrl }]
              : [],
            variants: [
              {
                id: currentRow.medusa_variant_id,
                prices: [
                  {
                    amount: Math.round(normalized.msrpUsd * 100),
                    currency_code: "usd",
                  },
                ],
              },
            ],
          },
        },
      })

      // Update vendor_product_current
      await (service as any).updateVendorProductCurrents(
        { id: currentRow.id },
        {
          content_hash: stagingRow.content_hash,
          normalized: normalized,
          last_seen_run_id: runId,
          applied_at: new Date(),
        }
      )

      processedCount++
    } catch (err: any) {
      logger.error(
        `[vendor-sync] [${runId}] Error updating product for ${partNumber}: ${err.message}`
      )
      errors.push({ partNumber, error: err.message })
    }
  }

  logger.info(
    `[vendor-sync] [${runId}] Apply complete: ${processedCount} processed, ${errors.length} errors`
  )

  return {
    processedCount,
    errorCount: errors.length,
    errors,
  }
}
