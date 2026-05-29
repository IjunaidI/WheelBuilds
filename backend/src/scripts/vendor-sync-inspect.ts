import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { VENDOR_SYNC_MODULE } from "../modules/vendor-sync"

/**
 * One-off inspection: counts products and groups by group_key, then
 * prints a few sample groups (Performance Replicas 126 GLOSS BLACK,
 * Asanti 172, a tire). Useful for confirming the apply produced the
 * grouped catalog we expect.
 */
export default async function vendorSyncInspect({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(VENDOR_SYNC_MODULE) as any
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const current = await service.listVendorProductCurrents(
    {},
    {
      select: [
        "id",
        "vendor_code",
        "part_number",
        "group_key",
        "medusa_product_id",
        "medusa_variant_id",
        "discontinued_at",
      ],
      take: null,
    }
  )

  // Distinct products and groups
  const productIds = new Set<string>()
  const groupsByKey = new Map<
    string,
    { vendor: string; partNumbers: string[]; productId: string | null }
  >()
  for (const row of current) {
    if (row.medusa_product_id) productIds.add(row.medusa_product_id)
    const g = groupsByKey.get(row.group_key) ?? {
      vendor: row.vendor_code,
      partNumbers: [],
      productId: row.medusa_product_id,
    }
    g.partNumbers.push(row.part_number)
    groupsByKey.set(row.group_key, g)
  }

  logger.info("")
  logger.info("Vendor Sync Inspect")
  logger.info("===================")
  logger.info(`vendor_product_current rows: ${current.length}`)
  logger.info(`Distinct Medusa products:    ${productIds.size}`)
  logger.info(`Distinct groups:             ${groupsByKey.size}`)
  logger.info("")
  logger.info("Group sizes:")
  const sizeDistribution: Record<number, number> = {}
  for (const g of groupsByKey.values()) {
    const n = g.partNumbers.length
    sizeDistribution[n] = (sizeDistribution[n] ?? 0) + 1
  }
  for (const size of Object.keys(sizeDistribution).map(Number).sort()) {
    logger.info(`  ${size}-variant groups: ${sizeDistribution[size]}`)
  }
  logger.info("")

  // Multi-variant groups (the ones that prove the grouping worked)
  const multi = Array.from(groupsByKey.entries()).filter(
    ([, g]) => g.partNumbers.length > 1
  )
  logger.info(`Multi-variant groups (${multi.length}):`)
  for (const [key, g] of multi) {
    logger.info(
      `  [${g.partNumbers.length}] ${key}  ->  product ${g.productId}`
    )
    for (const pn of g.partNumbers.sort()) {
      logger.info(`        ${pn}`)
    }
  }
  logger.info("")

  // Sample a real product to confirm the option matrix
  const sampleKey = "Performance Replicas|126|GLOSS BLACK"
  const sample = groupsByKey.get(sampleKey)
  if (sample?.productId) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "options.title",
        "options.values.value",
        "variants.sku",
        "variants.options.value",
        "variants.options.option.title",
      ],
      filters: { id: [sample.productId] },
    })
    const p = (products?.[0] as any) ?? null
    if (p) {
      logger.info(`Sample product: ${sampleKey}`)
      logger.info(`  id:      ${p.id}`)
      logger.info(`  title:   ${p.title}`)
      logger.info(`  handle:  ${p.handle}`)
      logger.info(`  status:  ${p.status}`)
      logger.info(`  options:`)
      for (const opt of p.options ?? []) {
        const values = (opt.values ?? []).map((v: any) => v.value).join(", ")
        logger.info(`    ${opt.title}: [${values}]`)
      }
      logger.info(`  variants (${(p.variants ?? []).length}):`)
      for (const v of p.variants ?? []) {
        const optStr = (v.options ?? [])
          .map((vo: any) => `${vo.option?.title}=${vo.value}`)
          .join(", ")
        logger.info(`    sku=${v.sku}  ${optStr}`)
      }
    } else {
      logger.warn(`Could not graph product ${sample.productId}`)
    }
  } else {
    logger.warn(`Sample group not found in current: ${sampleKey}`)
  }

  logger.info("===================")
}
