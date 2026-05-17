import { MedusaContainer } from "@medusajs/framework/types"
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
): Promise<{ discontinuedCount: number; errorCount: number }> {
  let discontinuedCount = 0
  let errorCount = 0

  for (const partNumber of discontinuedPartNumbers) {
    try {
      // 1. Look up vendor_product_current for (vendorCode, partNumber)
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

      // 2. Merge existing metadata and add discontinued_at
      const existingMetadata =
        (currentRow.normalized as any)?.metadata || {}
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

      // 3. Set discontinued_at on vendor_product_current
      await (service as any).updateVendorProductCurrents(
        { id: currentRow.id },
        { discontinued_at: new Date() }
      )

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

  return { discontinuedCount, errorCount }
}
