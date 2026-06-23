import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
  createProductVariantsWorkflow,
  updateProductVariantsWorkflow,
  updateProductOptionsWorkflow,
  batchInventoryItemLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  NormalizedRecord,
  WheelNormalizedRecord,
} from "../adapters/types"
import {
  ChangedGroup,
  DiscontinuedGroup,
  GroupDiffResult,
  NewGroup,
} from "./diff"
import {
  buildProductMetadata,
  buildVariantMetadata,
} from "./build-metadata"
import {
  ensureUsRegion,
  ensureDefaultSalesChannel,
  ensureProductCategories,
  ensureBrandCollection,
  ensureShippingProfile,
} from "./bootstrap"
import { applyStockLevels } from "./apply-stock"
import {
  WHEEL_OPTION_TITLES,
  axisKeyFromMetadata,
  buildGroupHandle,
  buildGroupTitle,
  buildProductOptions,
  buildVariantOptions,
  dedupeAddedAgainstExisting,
  dedupeExactDuplicates,
  findExactDuplicates,
  formatNumericOption,
  pickGroupRepresentative,
  slugify,
} from "./wheel-grouping"
import VendorSyncService from "../service"
import { indexVariantsBySku, partitionRecordsBySku } from "./adopt"

interface Logger {
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
}

export interface ApplyResult {
  // Number of variants successfully created or updated (sum across groups).
  processedCount: number
  // Number of product groups successfully created/updated/discontinued.
  groupCount: number
  errorCount: number
  errors: Array<{ groupKey?: string; partNumber?: string; error: string }>
  // True when the run was cancelled mid-apply. Callers should NOT
  // overwrite the run status to "completed" when this is true.
  cancelled: boolean
}

interface ApplyContext {
  container: MedusaContainer
  service: VendorSyncService
  runId: string
  vendorCode: string
  logger: Logger
  salesChannelId: string
  shippingProfileId: string
  categories: { wheelsCategoryId: string; tiresCategoryId: string }
  brandCollectionCache: Map<string, string>
}

/**
 * Apply a group-aware diff to Medusa:
 *   - newGroups          createProductsWorkflow once per group with N variants
 *   - changedGroups      reconcile variants only (add/remove/update)
 *   - discontinuedGroups draft the product, mark every variant discontinued
 *
 * Groups are processed sequentially; each is wrapped in try/catch so one
 * failing group does not abort the run. Cancellation is polled between
 * groups so cancel-while-applying stops cleanly without rolling back
 * already-committed groups.
 */
export async function applyChanges(
  container: MedusaContainer,
  service: VendorSyncService,
  runId: string,
  vendorCode: string,
  diff: GroupDiffResult,
  logger: Logger
): Promise<ApplyResult> {
  const errors: ApplyResult["errors"] = []
  let processedCount = 0
  let groupCount = 0
  let cancelled = false

  const checkCancelled = (): boolean => {
    if (service.isCancelled(runId)) {
      cancelled = true
      logger.warn(
        `[vendor-sync] [${runId}] cancel requested; stopping apply loop`
      )
      return true
    }
    return false
  }

  logger.info(`[vendor-sync] [${runId}] Bootstrapping Medusa entities...`)
  const [_regionId, salesChannelId, categories, shippingProfileId] =
    await Promise.all([
      ensureUsRegion(container),
      ensureDefaultSalesChannel(container),
      ensureProductCategories(container),
      ensureShippingProfile(container),
    ])

  const ctx: ApplyContext = {
    container,
    service,
    runId,
    vendorCode,
    logger,
    salesChannelId,
    shippingProfileId,
    categories,
    brandCollectionCache: new Map<string, string>(),
  }

  // The list of part_numbers that need a stock pass at the end. New +
  // changed variants get current-feed stock applied; removed variants
  // get their stock zeroed (applyStockLevels handles that case via the
  // previousStock map in vendor_product_current).
  const stockPartNumbers: string[] = []

  logger.info(
    `[vendor-sync] [${runId}] Applying ${diff.newGroups.length} new groups, ` +
      `${diff.changedGroups.length} changed, ` +
      `${diff.discontinuedGroups.length} discontinued`
  )

  // 1. New groups
  for (const group of diff.newGroups) {
    if (checkCancelled()) break
    try {
      const result = await applyNewGroup(ctx, group)
      processedCount += result.variantCount
      groupCount++
      stockPartNumbers.push(...group.part_numbers)
    } catch (err: any) {
      logger.error(
        `[vendor-sync] [${runId}] new group ${group.group_key} failed: ${err.message}`
      )
      errors.push({ groupKey: group.group_key, error: err.message })
    }
  }

  // 2. Changed groups
  if (!cancelled) {
    for (const group of diff.changedGroups) {
      if (checkCancelled()) break
      try {
        const result = await applyChangedGroup(ctx, group)
        processedCount += result.variantCount
        groupCount++
        stockPartNumbers.push(
          ...group.added_part_numbers,
          ...group.changed_part_numbers,
          // Removed parts also need a stock pass so their levels go to zero.
          ...group.removed_part_numbers
        )
      } catch (err: any) {
        logger.error(
          `[vendor-sync] [${runId}] changed group ${group.group_key} failed: ${err.message}`
        )
        errors.push({ groupKey: group.group_key, error: err.message })
      }
    }
  }

  // 3. Discontinued groups (whole-product gone)
  if (!cancelled) {
    for (const group of diff.discontinuedGroups) {
      if (checkCancelled()) break
      try {
        const result = await applyDiscontinuedGroup(ctx, group)
        processedCount += result.variantCount
        groupCount++
      } catch (err: any) {
        ctx.logger.error(
          `[vendor-sync] [${runId}] discontinue group ${group.group_key} failed: ${err.message}`
        )
        errors.push({ groupKey: group.group_key, error: err.message })
      }
    }
  }

  // 4. Stock pass for every part_number we touched in new or changed groups
  if (!cancelled && stockPartNumbers.length > 0) {
    const stockResult = await applyStockLevels(
      container,
      service,
      runId,
      vendorCode,
      stockPartNumbers,
      salesChannelId,
      logger
    )
    logger.info(
      `[vendor-sync] [${runId}] Stock levels applied: ${stockResult.updatedCount} updated, ${stockResult.errorCount} errors`
    )
  }

  logger.info(
    `[vendor-sync] [${runId}] Apply complete: groups=${groupCount} variants=${processedCount} errors=${errors.length}${cancelled ? " cancelled" : ""}`
  )

  return {
    processedCount,
    groupCount,
    errorCount: errors.length,
    errors,
    cancelled,
  }
}

// ---------------------------------------------------------------------------
// New groups: one createProductsWorkflow call per group with N variants
// ---------------------------------------------------------------------------

async function applyNewGroup(
  ctx: ApplyContext,
  group: NewGroup
): Promise<{ variantCount: number }> {
  const records = await readStagingRecords(ctx, group.part_numbers)
  if (records.length === 0) {
    throw new Error(
      `no staging rows found for group ${group.group_key} part_numbers=${group.part_numbers.join(",")}`
    )
  }

  const first = records[0]

  // Idempotency (WB-016): a prior failed attempt may have created the product
  // (createProductsWorkflow succeeded) but never persisted vendor_product_current
  // rows, so the re-diff still classifies this group as "new". Adopt the existing
  // product by external_id instead of creating a duplicate.
  const externalId =
    first.productType === "wheel" ? group.group_key : first.partNumber
  const existing = await findProductByExternalId(ctx, externalId)
  if (existing) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] adopting existing product ${existing.id} for group ${group.group_key} (external_id=${externalId}); prior partial apply`
    )
    await persistAdoptedGroup(ctx, group, records, existing)
    return { variantCount: records.length }
  }

  if (first.productType === "wheel") {
    return applyNewWheelGroup(ctx, group, records as WheelNormalizedRecord[])
  }
  return applyNewTireGroup(ctx, group, records)
}

async function applyNewWheelGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: WheelNormalizedRecord[]
): Promise<{ variantCount: number }> {
  // Dedupe exact duplicates (identical 6-tuple, e.g. the same wheel listed
  // twice). Center-bore- / load-rating-distinct rows are NOT duplicates and
  // survive as separate variants (WB-051).
  const { survivors, dropped } = dedupeExactDuplicates(records)
  for (const d of dropped) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] deduped exact duplicate, dropped ${d.partNumber} (group ${group.group_key})`
    )
  }
  // Defensive guard: dedupe must leave a collision-free survivor set. If not,
  // fail loud rather than create two variants with the same option tuple.
  const residual = findExactDuplicates(survivors)
  if (residual.length > 0) {
    throw new Error(
      `unexpected residual 6-axis collision after dedupe in group ${group.group_key}: ${residual[0]
        .map((r) => r.partNumber)
        .join(", ")}`
    )
  }

  const rep = pickGroupRepresentative(survivors)
  const productOptions = buildProductOptions(survivors)
  const brandCollectionId = await getBrandCollectionId(ctx, rep.brand)
  const categoryId = ctx.categories.wheelsCategoryId

  const productWeight = rep.shippingWeightLb
    ? Math.round(rep.shippingWeightLb * 453.592)
    : undefined

  const variants = survivors.map((r) => buildWheelVariantInput(r))

  const { result } = await createProductsWorkflow(ctx.container).run({
    input: {
      products: [
        {
          title: buildGroupTitle(rep),
          handle: buildGroupHandle(rep),
          status: ProductStatus.PUBLISHED,
          thumbnail: rep.imageUrl ?? undefined,
          images: rep.imageUrl ? [{ url: rep.imageUrl }] : [],
          weight: productWeight,
          collection_id: brandCollectionId,
          category_ids: [categoryId],
          sales_channels: [{ id: ctx.salesChannelId }],
          shipping_profile_id: ctx.shippingProfileId,
          external_id: group.group_key,
          metadata: buildProductMetadata(rep),
          options: productOptions,
          variants,
        },
      ],
    },
  })

  const createdProduct = result[0]
  await persistGroupAfterCreate(ctx, group, survivors, createdProduct)
  return { variantCount: survivors.length }
}

async function applyNewTireGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[]
): Promise<{ variantCount: number }> {
  // Tires still go through the one-product-one-variant path until a
  // tire grouping rule is defined. Each tire "group" has exactly one
  // part_number (sku: fallback).
  if (records.length !== 1) {
    throw new Error(
      `tire group ${group.group_key} has ${records.length} records; expected 1`
    )
  }
  const r = records[0]
  const brandCollectionId = await getBrandCollectionId(ctx, r.brand)
  const categoryId = ctx.categories.tiresCategoryId

  const { result } = await createProductsWorkflow(ctx.container).run({
    input: {
      products: [
        {
          title: r.title,
          handle: slugify(r.partNumber),
          status: ProductStatus.PUBLISHED,
          thumbnail: r.imageUrl ?? undefined,
          images: r.imageUrl ? [{ url: r.imageUrl }] : [],
          collection_id: brandCollectionId,
          category_ids: [categoryId],
          sales_channels: [{ id: ctx.salesChannelId }],
          shipping_profile_id: ctx.shippingProfileId,
          external_id: r.partNumber,
          metadata: buildProductMetadata(r),
          options: [{ title: "Default", values: ["Default"] }],
          variants: [
            {
              title: "Default",
              sku: r.partNumber,
              options: { Default: "Default" },
              manage_inventory: true,
              allow_backorder: false,
              metadata: buildVariantMetadata(r),
              prices: [
                {
                  amount: r.msrpUsd,
                  currency_code: "usd",
                },
              ],
            },
          ],
        },
      ],
    },
  })

  const createdProduct = result[0]
  await persistGroupAfterCreate(ctx, group, records, createdProduct)
  return { variantCount: 1 }
}

// ---------------------------------------------------------------------------
// Changed groups: reconcile variants only
// ---------------------------------------------------------------------------

async function applyChangedGroup(
  ctx: ApplyContext,
  group: ChangedGroup
): Promise<{ variantCount: number }> {
  // Read all current rows for this group_key so we know the productId
  // and have variant IDs for changes/removes.
  const currentRows = await listCurrentRowsForGroup(ctx, group.group_key)
  if (currentRows.length === 0) {
    throw new Error(
      `changed group ${group.group_key} has no current rows`
    )
  }
  const productId = currentRows[0].medusa_product_id
  if (!productId) {
    throw new Error(
      `changed group ${group.group_key} current row missing medusa_product_id`
    )
  }
  const currentByPart = new Map(currentRows.map((r) => [r.part_number, r]))

  let variantCount = 0

  // (a) changed_part_numbers - update existing variants
  if (group.changed_part_numbers.length > 0) {
    const changedRecords = await readStagingRecords(
      ctx,
      group.changed_part_numbers
    )
    const variantUpdates = changedRecords.map((r) => {
      const currentRow = currentByPart.get(r.partNumber)
      if (!currentRow?.medusa_variant_id) {
        throw new Error(
          `changed variant ${r.partNumber} missing medusa_variant_id`
        )
      }
      return {
        id: currentRow.medusa_variant_id,
        metadata: buildVariantMetadata(r),
        prices: [
          {
            amount: r.msrpUsd,
            currency_code: "usd",
          },
        ],
        ...wheelVariantWeight(r),
      }
    })

    await updateProductVariantsWorkflow(ctx.container).run({
      input: { product_variants: variantUpdates },
    })

    // Write back vendor_product_current
    for (const r of changedRecords) {
      const currentRow = currentByPart.get(r.partNumber)!
      const stagingRow = await readStagingRow(ctx, r.partNumber)
      await (ctx.service as any).updateVendorProductCurrents({
        id: currentRow.id,
        content_hash: stagingRow.content_hash,
        normalized: r,
        last_seen_run_id: ctx.runId,
        applied_at: new Date(),
      })
      variantCount++
    }
  }

  // (b) added_part_numbers - create new variants on the existing product
  if (group.added_part_numbers.length > 0) {
    const addedRecords = await readStagingRecords(
      ctx,
      group.added_part_numbers
    )
    const productType = addedRecords[0].productType

    if (productType === "wheel") {
      const wheelAdds = addedRecords as WheelNormalizedRecord[]

      const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: existingVariants } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
        filters: { product_id: [productId] },
      })
      const existingSkus = new Set<string>(
        (existingVariants ?? []).map((v: any) => v.sku).filter(Boolean)
      )
      const { toCreate: skuNew } = partitionRecordsBySku(wheelAdds, existingSkus)

      // Drop any added SKU whose 6-tuple already exists on the product
      // (exact duplicate of a current variant) or repeats within this batch.
      const existingAxisKeys = new Set<string>(
        (existingVariants ?? []).map((v: any) =>
          axisKeyFromMetadata((v.metadata ?? {}) as Record<string, unknown>)
        )
      )
      const { toCreate, dropped } = dedupeAddedAgainstExisting(
        skuNew,
        existingAxisKeys
      )
      for (const d of dropped) {
        ctx.logger.warn(
          `[vendor-sync] [${ctx.runId}] deduped exact duplicate on add, dropped ${d.partNumber} (group ${group.group_key})`
        )
      }
      const droppedSkus = new Set(dropped.map((r) => r.partNumber))

      let createdVariants: any[] = []
      if (toCreate.length > 0) {
        await extendWheelOptions(ctx, productId, toCreate)

        const variants = toCreate.map((r) => ({
          product_id: productId,
          ...buildWheelVariantInput(r),
        }))

        const created = await createProductVariantsWorkflow(ctx.container).run({
          input: { product_variants: variants },
        })
        createdVariants = created.result
      }

      // Persist current rows for every added part EXCEPT the dropped duplicates
      // (which have no variant of their own).
      const skuIndex = indexVariantsBySku([
        ...(existingVariants ?? []),
        ...createdVariants,
      ])
      const toPersist = wheelAdds.filter((r) => !droppedSkus.has(r.partNumber))
      await persistAddedVariants(
        ctx,
        group.group_key,
        toPersist,
        skuIndex,
        productId
      )
      variantCount += toPersist.length
    } else {
      // Tires: each row is its own group, so added_part_numbers on a
      // tire changedGroup should never happen. Defensive log + skip.
      ctx.logger.warn(
        `[vendor-sync] [${ctx.runId}] tire group ${group.group_key} ` +
          `unexpectedly has added_part_numbers=${group.added_part_numbers.join(",")}`
      )
    }
  }

  // (c) removed_part_numbers - variant leaves group, product survives.
  //     keep manage_inventory=true (per decision 2), zero stock will run
  //     in the final stock pass, mark variant metadata discontinued.
  for (const partNumber of group.removed_part_numbers) {
    const currentRow = currentByPart.get(partNumber)
    if (!currentRow?.medusa_variant_id) {
      ctx.logger.warn(
        `[vendor-sync] [${ctx.runId}] removed variant ${partNumber} missing medusa_variant_id; skipping`
      )
      continue
    }

    const discontinuedAt = new Date().toISOString()
    const existingMeta = buildVariantMetadata(
      currentRow.normalized as NormalizedRecord
    )

    await updateProductVariantsWorkflow(ctx.container).run({
      input: {
        product_variants: [
          {
            id: currentRow.medusa_variant_id,
            allow_backorder: false,
            metadata: {
              ...existingMeta,
              discontinued: true,
              discontinued_at: discontinuedAt,
            },
          },
        ],
      },
    })

    await (ctx.service as any).updateVendorProductCurrents({
      id: currentRow.id,
      discontinued_at: new Date(),
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
    })
    variantCount++
  }

  return { variantCount }
}

// ---------------------------------------------------------------------------
// Discontinued groups: whole product gone
// ---------------------------------------------------------------------------

async function applyDiscontinuedGroup(
  ctx: ApplyContext,
  group: DiscontinuedGroup
): Promise<{ variantCount: number }> {
  const currentRows = await listCurrentRowsForGroup(ctx, group.group_key)
  if (currentRows.length === 0) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] discontinued group ${group.group_key} has no current rows; skipping`
    )
    return { variantCount: 0 }
  }
  const productId = currentRows[0].medusa_product_id
  if (!productId) {
    throw new Error(
      `discontinued group ${group.group_key} current row missing medusa_product_id`
    )
  }

  // Idempotency: every member already discontinued -> no-op so replay
  // does not re-emit product.updated for nothing.
  const allDiscontinued = currentRows.every((r) => r.discontinued_at !== null)
  if (allDiscontinued) {
    ctx.logger.info(
      `[vendor-sync] [${ctx.runId}] group ${group.group_key} already discontinued, skipping`
    )
    return { variantCount: 0 }
  }

  // Read live product metadata so admin-added keys are preserved (the
  // currentRow.normalized snapshot is a per-row vendor field set and
  // never carries admin metadata).
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: [productId] },
  })
  const existingProductMetadata =
    ((products?.[0] as any)?.metadata as Record<string, unknown>) ?? {}
  const discontinuedAt = new Date().toISOString()

  await updateProductsWorkflow(ctx.container).run({
    input: {
      selector: { id: productId },
      update: {
        status: "draft" as any,
        metadata: {
          ...existingProductMetadata,
          discontinued_at: discontinuedAt,
        },
      },
    },
  })

  // Mark each surviving variant as discontinued so the storefront can
  // hide or badge them individually.
  const variantUpdates = currentRows
    .filter((r) => r.discontinued_at === null && r.medusa_variant_id)
    .map((r) => {
      const meta = buildVariantMetadata(r.normalized as NormalizedRecord)
      return {
        id: r.medusa_variant_id as string,
        allow_backorder: false,
        metadata: {
          ...meta,
          discontinued: true,
          discontinued_at: discontinuedAt,
        },
      }
    })

  if (variantUpdates.length > 0) {
    await updateProductVariantsWorkflow(ctx.container).run({
      input: { product_variants: variantUpdates },
    })
  }

  // Zero every variant's stock everywhere. Each inventory_item_id may
  // have several inventory levels; we zero them all.
  await zeroStockForCurrentRows(ctx, currentRows)

  // Mark vendor_product_current.discontinued_at for each member that
  // was not already discontinued.
  for (const row of currentRows) {
    if (row.discontinued_at !== null) continue
    await (ctx.service as any).updateVendorProductCurrents({
      id: row.id,
      discontinued_at: new Date(),
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
    })
  }

  ctx.logger.info(
    `[vendor-sync] [${ctx.runId}] group discontinued: ${group.group_key} (${variantUpdates.length} variants)`
  )

  return { variantCount: variantUpdates.length }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getBrandCollectionId(
  ctx: ApplyContext,
  brand: string
): Promise<string> {
  const cached = ctx.brandCollectionCache.get(brand)
  if (cached) return cached
  const id = await ensureBrandCollection(ctx.container, brand)
  ctx.brandCollectionCache.set(brand, id)
  return id
}

async function readStagingRecords(
  ctx: ApplyContext,
  partNumbers: string[]
): Promise<NormalizedRecord[]> {
  const rows = await (ctx.service as any).listVendorFeedStagings(
    { run_id: ctx.runId, part_number: partNumbers },
    { take: null }
  )
  return rows.map((r: any) => r.normalized as NormalizedRecord)
}

async function readStagingRow(
  ctx: ApplyContext,
  partNumber: string
): Promise<{ content_hash: string; normalized: NormalizedRecord }> {
  const [row] = await (ctx.service as any).listVendorFeedStagings(
    { run_id: ctx.runId, part_number: partNumber },
    { take: 1 }
  )
  if (!row) {
    throw new Error(`staging row missing for part_number=${partNumber}`)
  }
  return row
}

async function listCurrentRowsForGroup(
  ctx: ApplyContext,
  groupKey: string
): Promise<any[]> {
  return (ctx.service as any).listVendorProductCurrents(
    { vendor_code: ctx.vendorCode, group_key: groupKey },
    { take: null }
  )
}

async function findProductByExternalId(
  ctx: ApplyContext,
  externalId: string
): Promise<any | null> {
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "variants.id",
      "variants.sku",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { external_id: [externalId] },
  })
  return data?.[0] ?? null
}

/**
 * Persist vendor_product_current rows for a group whose Medusa product already
 * exists (adopted on retry). Upsert by (vendor_code, part_number) so a partial
 * re-adopt is itself idempotent.
 */
async function persistAdoptedGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[],
  existingProduct: any
): Promise<void> {
  const skuIndex = indexVariantsBySku(existingProduct.variants ?? [])
  for (const r of records) {
    const stagingRow = await readStagingRow(ctx, r.partNumber)
    const info = skuIndex.get(r.partNumber)
    if (!info?.inventoryItemId) {
      ctx.logger.warn(
        `[vendor-sync] [${ctx.runId}] adopted variant ${r.partNumber} missing inventory_item_id`
      )
    }
    const fields = {
      group_key: r.groupKey,
      content_hash: stagingRow.content_hash,
      medusa_product_id: existingProduct.id,
      medusa_variant_id: info?.variantId ?? null,
      inventory_item_id: info?.inventoryItemId ?? null,
      normalized: r,
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
      discontinued_at: null,
    }
    const [existingRow] = await (ctx.service as any).listVendorProductCurrents(
      { vendor_code: ctx.vendorCode, part_number: r.partNumber },
      { take: 1 }
    )
    if (existingRow) {
      await (ctx.service as any).updateVendorProductCurrents({
        id: existingRow.id,
        ...fields,
      })
    } else {
      await (ctx.service as any).createVendorProductCurrents({
        vendor_code: ctx.vendorCode,
        part_number: r.partNumber,
        ...fields,
      })
    }
  }
}

function wheelVariantWeight(
  r: NormalizedRecord
): { weight?: number } {
  if (r.productType !== "wheel" || !r.shippingWeightLb) return {}
  return { weight: Math.round(r.shippingWeightLb * 453.592) }
}

function buildWheelVariantInput(r: WheelNormalizedRecord) {
  const variantTitle = [
    r.boltPatternRaw,
    `${r.diameterIn}x${r.widthIn}`,
    `ET${r.offsetMm}`,
    r.centerBoreMm != null ? `CB${formatNumericOption(r.centerBoreMm)}` : null,
    r.loadRatingLb != null ? `LR${formatNumericOption(r.loadRatingLb)}` : null,
  ]
    .filter(Boolean)
    .join(" ")
  return {
    title: variantTitle,
    sku: r.partNumber,
    options: buildVariantOptions(r),
    manage_inventory: true,
    allow_backorder: false,
    metadata: buildVariantMetadata(r),
    prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
    ...wheelVariantWeight(r),
  }
}

async function persistGroupAfterCreate(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[],
  createdProduct: any
): Promise<void> {
  // Query the variants we just created to extract inventory_item_id per
  // SKU. createProductsWorkflow does NOT eagerly populate the
  // inventory_items link, so the variant returned in `result` has the
  // field but it's undefined. See CLAUDE.md gotcha.
  const variantIds: string[] = (createdProduct.variants ?? [])
    .map((v: any) => v.id)
    .filter(Boolean)

  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variantsWithInv } = await query.graph({
    entity: "variant",
    fields: ["id", "sku", "inventory_items.inventory_item_id"],
    filters: { id: variantIds },
  })

  const invItemBySku = new Map<string, string | null>()
  const variantIdBySku = new Map<string, string>()
  for (const v of variantsWithInv ?? []) {
    const sku = (v as any).sku
    if (!sku) continue
    variantIdBySku.set(sku, (v as any).id)
    invItemBySku.set(
      sku,
      (v as any).inventory_items?.[0]?.inventory_item_id ?? null
    )
  }

  for (const r of records) {
    const stagingRow = await readStagingRow(ctx, r.partNumber)
    const inventoryItemId = invItemBySku.get(r.partNumber) ?? null
    const variantId = variantIdBySku.get(r.partNumber) ?? null
    if (!inventoryItemId) {
      ctx.logger.warn(
        `[vendor-sync] [${ctx.runId}] inventory_item_id missing after create for ${r.partNumber}`
      )
    }

    await (ctx.service as any).createVendorProductCurrents({
      vendor_code: ctx.vendorCode,
      part_number: r.partNumber,
      group_key: r.groupKey,
      content_hash: stagingRow.content_hash,
      medusa_product_id: createdProduct.id,
      medusa_variant_id: variantId,
      inventory_item_id: inventoryItemId,
      normalized: r,
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
      discontinued_at: null,
    })
  }
}

async function persistAddedVariants(
  ctx: ApplyContext,
  groupKey: string,
  records: NormalizedRecord[],
  skuIndex: Map<string, { variantId: string; inventoryItemId: string | null }>,
  productId: string
): Promise<void> {
  for (const r of records) {
    const stagingRow = await readStagingRow(ctx, r.partNumber)
    const info = skuIndex.get(r.partNumber)

    const fields = {
      group_key: groupKey,
      content_hash: stagingRow.content_hash,
      medusa_product_id: productId,
      medusa_variant_id: info?.variantId ?? null,
      inventory_item_id: info?.inventoryItemId ?? null,
      normalized: r,
      last_seen_run_id: ctx.runId,
      applied_at: new Date(),
      discontinued_at: null,
    }

    // UPSERT by (vendor_code, part_number): the part may already have a current
    // row (moved from another group, or a prior partial attempt).
    const [existing] = await (ctx.service as any).listVendorProductCurrents(
      { vendor_code: ctx.vendorCode, part_number: r.partNumber },
      { take: 1 }
    )
    if (existing) {
      await (ctx.service as any).updateVendorProductCurrents({
        id: existing.id,
        ...fields,
      })
    } else {
      await (ctx.service as any).createVendorProductCurrents({
        vendor_code: ctx.vendorCode,
        part_number: r.partNumber,
        ...fields,
      })
    }
  }
}

/**
 * For each option title in the wheel option set, extend the existing
 * option's values to include any new value introduced by `addedRecords`.
 * This is required because createProductVariantsWorkflow only accepts
 * option values that already exist on the product.
 */
async function extendWheelOptions(
  ctx: ApplyContext,
  productId: string,
  addedRecords: WheelNormalizedRecord[]
): Promise<void> {
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "options.id", "options.title", "options.values.value"],
    filters: { id: [productId] },
  })
  const existingOptions = (products?.[0] as any)?.options ?? []
  if (existingOptions.length === 0) return

  const newOptions = buildProductOptions(addedRecords)
  for (const newOpt of newOptions) {
    const existing = existingOptions.find(
      (o: any) => o.title === newOpt.title
    )
    if (!existing) continue
    const existingValues = new Set<string>(
      (existing.values ?? []).map((v: any) => v.value)
    )
    const merged = new Set<string>([...existingValues, ...newOpt.values])
    if (merged.size === existingValues.size) continue

    await updateProductOptionsWorkflow(ctx.container).run({
      input: {
        selector: { id: existing.id },
        update: { values: [...merged] },
      },
    })
  }
}

async function zeroStockForCurrentRows(
  ctx: ApplyContext,
  currentRows: Array<{ inventory_item_id: string | null }>
): Promise<void> {
  const inventoryService = ctx.container.resolve(Modules.INVENTORY)
  for (const row of currentRows) {
    if (!row.inventory_item_id) continue
    const levels = await inventoryService.listInventoryLevels(
      { inventory_item_id: row.inventory_item_id },
      { take: null }
    )
    const nonZero = levels.filter((l: any) => l.stocked_quantity !== 0)
    if (nonZero.length === 0) continue
    await batchInventoryItemLevelsWorkflow(ctx.container).run({
      input: {
        create: [],
        delete: [],
        update: nonZero.map((l: any) => ({
          id: l.id,
          inventory_item_id: row.inventory_item_id as string,
          location_id: l.location_id,
          stocked_quantity: 0,
        })),
        force: false,
      },
    })
  }
}
