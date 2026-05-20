import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import VendorSyncService from "../service"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

/**
 * Mark products as discontinued by setting their Medusa status to 'draft'
 * and recording discontinued_at in both product metadata and the
 * vendor_product_current row.
 *
 * We NEVER delete products — only draft them with a discontinued_at timestamp.
 */
export async function applyDiscontinuations(
  container: MedusaContainer,
  service: VendorSyncService,
  vendorCode: string,
  discontinuedPartNumbers: string[],
  logger: Logger
): Promise<{ discontinuedCount: number; errorCount: number; skippedCount: number }> {
  let discontinuedCount = 0
  let errorCount = 0
  let skippedCount = 0
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  for (const partNumber of discontinuedPartNumbers) {
    try {
      const [currentRow] = await (service as any).listVendorProductCurrents(
        { vendor_code: vendorCode, part_number: partNumber },
        { take: 1 }
      )

      if (!currentRow || !currentRow.medusa_product_id) {
        logger.warn(
          `[vendor-sync] discontinue: no current row or product id for ${vendorCode}/${partNumber}`
        )
        continue
      }

      // Idempotency: already discontinued -> no-op. Replay/approve paths
      // can re-enter this loop for the same SKU, and we don't want to
      // re-emit product.updated (which triggers another Meilisearch
      // indexing pass) for no reason.
      if (currentRow.discontinued_at) {
        skippedCount++
        logger.info(
          `[vendor-sync] discontinue: already discontinued, skipping ${vendorCode}/${partNumber}`
        )
        continue
      }

      // Read the existing Medusa product metadata so admin-added keys
      // are preserved. The previous implementation read from
      // currentRow.normalized.metadata which is always undefined.
      const { data: products } = await query.graph({
        entity: "product",
        fields: ["id", "metadata"],
        filters: { id: [currentRow.medusa_product_id] },
      })
      const existingMetadata =
        ((products?.[0] as any)?.metadata as Record<string, unknown>) ?? {}
      const discontinuedAt = new Date().toISOString()

      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: currentRow.medusa_product_id },
          update: {
            status: "draft" as any,
            metadata: {
              ...existingMetadata,
              discontinued_at: discontinuedAt,
            },
          },
        },
      })

      await (service as any).updateVendorProductCurrents({
        id: currentRow.id,
        discontinued_at: new Date(),
      })

      discontinuedCount++
      logger.info(
        `[vendor-sync] product discontinued: ${vendorCode}/${partNumber}`
      )
    } catch (err: any) {
      errorCount++
      logger.error(
        `[vendor-sync] discontinue failed for ${vendorCode}/${partNumber}: ${err.message}`
      )
    }
  }

  return { discontinuedCount, errorCount, skippedCount }
}
