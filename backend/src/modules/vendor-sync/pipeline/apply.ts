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
  TireNormalizedRecord,
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
import { mapWithConcurrency } from "./concurrency"
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
} from "./wheel-grouping"
import {
  buildTireGroupHandle,
  buildTireGroupTitle,
  buildTireProductOptions,
  buildTireVariantOptions,
  dedupeTireExactDuplicates,
  findTireExactDuplicates,
  TIRE_OPTION_TITLES,
  tireVariantAxisKey,
} from "./tire-grouping"
import VendorSyncService from "../service"
import { indexVariantsBySku, partitionRecordsBySku } from "./adopt"
import { suffixedHandle, isHandleConflictError } from "./handle-collision"

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
  brandCollectionCache: Map<string, Promise<string>>
  touchedProductIds: Set<string>
}

/**
 * Apply a group-aware diff to Medusa:
 *   - newGroups          createProductsWorkflow once per group with N variants
 *   - changedGroups      reconcile variants only (add/remove/update)
 *   - discontinuedGroups draft the product, mark every variant discontinued
 *
 * Phases run in order (new → changed → discontinued); within a phase the
 * groups run concurrently (up to `getApplyConcurrency()` in flight) via
 * mapWithConcurrency. Each group is wrapped in try/catch so one failing group
 * does not abort the run. Cancellation gates scheduling: a cancel stops
 * launching new groups (in-flight groups finish) and `cancelled` is recomputed
 * between phases so cancel-while-applying stops cleanly without rolling back
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

  // WB-014: each phase runs its groups concurrently (up to `concurrency` in
  // flight) via mapWithConcurrency. `isCancelled` is the shouldStop gate — it
  // stops SCHEDULING new groups; in-flight groups finish. `cancelled` is
  // recomputed between phases so a mid-apply cancel skips later phases.
  const concurrency = service.getApplyConcurrency()
  const isCancelled = () => service.isCancelled(runId)
  // Recomputes `cancelled` between phases; logs once, at the transition to
  // true, so a mid-run cancel is still observable (restores the log the old
  // sequential `checkCancelled` closure used to emit).
  const recomputeCancelled = async () => {
    if (cancelled) return
    if (await isCancelled()) {
      cancelled = true
      logger.warn(
        `[vendor-sync] [${runId}] cancel requested; stopping apply loop`
      )
    }
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
    brandCollectionCache: new Map<string, Promise<string>>(),
    touchedProductIds: new Set<string>(),
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

  // 1. New groups. The shared counters (processedCount/groupCount/errors/
  // stockPartNumbers) are mutated SYNCHRONOUSLY after each task's own await
  // resolves — no await splits a read-modify-write, so they are race-free
  // under the single-threaded event loop even with `concurrency` tasks in
  // flight. Each task catches its own errors so one bad group never rejects
  // the batch.
  await mapWithConcurrency(
    diff.newGroups,
    concurrency,
    async (group) => {
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
    },
    isCancelled
  )
  await recomputeCancelled()

  // 2. Changed groups
  if (!cancelled) {
    await mapWithConcurrency(
      diff.changedGroups,
      concurrency,
      async (group) => {
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
      },
      isCancelled
    )
    await recomputeCancelled()
  }

  // 3. Discontinued groups (whole-product gone)
  if (!cancelled) {
    await mapWithConcurrency(
      diff.discontinuedGroups,
      concurrency,
      async (group) => {
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
      },
      isCancelled
    )
    await recomputeCancelled()
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
      logger,
      { settleHash: true }
    )
    // Finding 5: stock errors are real apply errors — merge them so
    // finalizeApply marks partially_failed/exhausted (not completed) and
    // failed_part_numbers surfaces them for the console + replay-sku.
    for (const e of stockResult.errors) {
      errors.push({ partNumber: e.partNumber, error: e.error })
    }
    logger.info(
      `[vendor-sync] [${runId}] Stock levels applied: ${stockResult.updatedCount} updated, ${stockResult.errors.length} errors`
    )
  }

  // Finding 6: re-index changed/re-listed products in Meilisearch. New-group
  // create and discontinue already emit via createProducts/updateProducts
  // workflows; this covers variant-only mutations. Emitted even if the stock
  // pass errored — the variant/price change committed and must be indexed.
  if (ctx.touchedProductIds.size > 0) {
    const eventBus = container.resolve(Modules.EVENT_BUS)
    for (const id of ctx.touchedProductIds) {
      await eventBus.emit({ name: "product.updated", data: { id } })
    }
    logger.info(
      `[vendor-sync] [${runId}] emitted product.updated for ${ctx.touchedProductIds.size} products (reindex)`
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
  // Idempotency-adoption external id MUST equal what each create writes:
  //  - wheels: applyNewWheelGroup ALWAYS creates with external_id = group_key
  //    (incl. "sku:<pn>" fallback wheels) — adopt by group_key, unchanged.
  //  - tires: applyNewTireGroup creates group_key when grouped, else the part
  //    number for "sku:" fallback groups — mirror that.
  const externalId =
    first.productType === "wheel"
      ? group.group_key
      : group.group_key.startsWith("sku:")
        ? first.partNumber
        : group.group_key
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

/**
 * Create a product, retrying ONCE under a deterministic handle suffix if the
 * base handle collides with an existing product (distinct group_keys can
 * slugify to the same handle — WB-089 L10). buildInput must return the full
 * product input for a given handle; everything else stays identical.
 */
async function createProductWithUniqueHandle(
  ctx: ApplyContext,
  groupKey: string,
  baseHandle: string,
  buildInput: (handle: string) => any
): Promise<any> {
  try {
    const { result } = await createProductsWorkflow(ctx.container).run({
      input: { products: [buildInput(baseHandle)] },
    })
    return result[0]
  } catch (err: any) {
    if (!isHandleConflictError(err)) throw err
    const retryHandle = suffixedHandle(baseHandle, groupKey)
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] handle "${baseHandle}" collided for group ${groupKey}; retrying as "${retryHandle}"`
    )
    const { result } = await createProductsWorkflow(ctx.container).run({
      input: { products: [buildInput(retryHandle)] },
    })
    return result[0]
  }
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

  // One image per finish: the product carries the union; the thumbnail is the
  // representative finish's image; each variant keeps its own image_url in
  // metadata (buildVariantMetadata) for the PDP finish swatch. (WB-059)
  const imageUrls = Array.from(
    new Set(survivors.map((r) => r.imageUrl).filter((u): u is string => !!u))
  )

  const createdProduct = await createProductWithUniqueHandle(
    ctx,
    group.group_key,
    buildGroupHandle(rep),
    (handle) => ({
      title: buildGroupTitle(rep),
      handle,
      status: ProductStatus.PUBLISHED,
      thumbnail: rep.imageUrl ?? undefined,
      images: imageUrls.map((url) => ({ url })),
      weight: productWeight,
      collection_id: brandCollectionId,
      category_ids: [categoryId],
      sales_channels: [{ id: ctx.salesChannelId }],
      shipping_profile_id: ctx.shippingProfileId,
      external_id: group.group_key,
      metadata: buildProductMetadata(rep),
      options: productOptions,
      variants,
    })
  )
  await persistGroupAfterCreate(ctx, group, survivors, createdProduct)
  return { variantCount: survivors.length }
}

async function applyNewTireGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[]
): Promise<{ variantCount: number }> {
  const tires = records as TireNormalizedRecord[]

  // Collapse exact-duplicate size labels (in-stock-first), then guard.
  const { survivors, dropped } = dedupeTireExactDuplicates(tires)
  for (const d of dropped) {
    ctx.logger.warn(
      `[vendor-sync] [${ctx.runId}] deduped exact duplicate tire size, dropped ${d.partNumber} (group ${group.group_key})`
    )
  }
  const residual = findTireExactDuplicates(survivors)
  if (residual.length > 0) {
    throw new Error(
      `unexpected residual tire size collision after dedupe in group ${group.group_key}: ${residual[0]
        .map((r) => r.partNumber)
        .join(", ")}`
    )
  }

  const rep = pickGroupRepresentative(
    survivors as any
  ) as unknown as TireNormalizedRecord
  const brandCollectionId = await getBrandCollectionId(ctx, rep.brand)
  const categoryId = ctx.categories.tiresCategoryId
  const productOptions = buildTireProductOptions(survivors)

  const imageUrls = Array.from(
    new Set(survivors.map((r) => r.imageUrl).filter((u): u is string => !!u))
  )

  const variants = survivors.map((r) => ({
    title: tireSizeLabelForVariantTitle(r),
    sku: r.partNumber,
    options: buildTireVariantOptions(r),
    manage_inventory: true,
    allow_backorder: false,
    metadata: buildVariantMetadata(r),
    prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
  }))

  const createdProduct = await createProductWithUniqueHandle(
    ctx,
    group.group_key,
    buildTireGroupHandle(rep),
    (handle) => ({
      title: buildTireGroupTitle(rep),
      handle,
      status: ProductStatus.PUBLISHED,
      thumbnail: rep.imageUrl ?? undefined,
      images: imageUrls.map((url) => ({ url })),
      collection_id: brandCollectionId,
      category_ids: [categoryId],
      sales_channels: [{ id: ctx.salesChannelId }],
      shipping_profile_id: ctx.shippingProfileId,
      external_id: group.group_key.startsWith("sku:")
        ? rep.partNumber
        : group.group_key,
      metadata: buildProductMetadata(rep),
      options: productOptions,
      variants,
    })
  )
  await persistGroupAfterCreate(ctx, group, survivors, createdProduct)
  return { variantCount: survivors.length }
}

// Variant display title: the size label is already unique + human-readable.
function tireSizeLabelForVariantTitle(r: TireNormalizedRecord): string {
  return buildTireVariantOptions(r).Size
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
        content_hash: "", // unsettled; settled by the stock pass (F5)
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
      const { toCreate: skuNew, toAdopt } = partitionRecordsBySku(wheelAdds, existingSkus)

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
      // Finding 4: SKUs already on the product (re-listed after removal) are
      // otherwise only given a current-row write — refresh the live variant so
      // discontinued flags clear and the price is current.
      await refreshReListedVariants(ctx, productId, toAdopt)

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
      const tireAdds = addedRecords as TireNormalizedRecord[]

      const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: existingVariants } = await query.graph({
        entity: "variant",
        fields: ["id", "sku", "metadata", "inventory_items.inventory_item_id"],
        filters: { product_id: [productId] },
      })
      const existingSkus = new Set<string>(
        (existingVariants ?? []).map((v: any) => v.sku).filter(Boolean)
      )
      const { toCreate: skuNew, toAdopt } = partitionRecordsBySku(tireAdds, existingSkus)

      // Drop any added row whose size label already exists on the product.
      const existingSizeLabels = new Set<string>(
        (existingVariants ?? []).map((v: any) =>
          String((v.metadata as any)?.size_label ?? "")
        ).filter(Boolean)
      )
      const seen = new Set(existingSizeLabels)
      const toCreate: TireNormalizedRecord[] = []
      const droppedSkus = new Set<string>()
      for (const r of skuNew) {
        const label = tireVariantAxisKey(r)
        if (seen.has(label)) {
          droppedSkus.add(r.partNumber)
          ctx.logger.warn(
            `[vendor-sync] [${ctx.runId}] deduped duplicate tire size on add, dropped ${r.partNumber} (group ${group.group_key})`
          )
          continue
        }
        seen.add(label)
        toCreate.push(r)
      }

      let createdVariants: any[] = []
      if (toCreate.length > 0) {
        await extendTireOptions(ctx, productId, toCreate)
        const variants = toCreate.map((r) => ({
          product_id: productId,
          title: tireSizeLabelForVariantTitle(r),
          sku: r.partNumber,
          options: buildTireVariantOptions(r),
          manage_inventory: true,
          allow_backorder: false,
          metadata: buildVariantMetadata(r),
          prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
        }))
        const created = await createProductVariantsWorkflow(ctx.container).run({
          input: { product_variants: variants },
        })
        createdVariants = created.result
      }

      const skuIndex = indexVariantsBySku([
        ...(existingVariants ?? []),
        ...createdVariants,
      ])
      // Finding 4: SKUs already on the product (re-listed after removal) are
      // otherwise only given a current-row write — refresh the live variant so
      // discontinued flags clear and the price is current.
      await refreshReListedVariants(ctx, productId, toAdopt)

      const toPersist = tireAdds.filter((r) => !droppedSkus.has(r.partNumber))
      await persistAddedVariants(ctx, group.group_key, toPersist, skuIndex, productId)
      variantCount += toPersist.length
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

  // Finding 6: the changed path mutates variants/options only, which never
  // emits product.updated — so Meilisearch keeps stale price_min/facets. Record
  // the product so applyChanges emits one product.updated for it.
  ctx.touchedProductIds.add(productId)

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

// Promise-memoized so two concurrent same-brand groups share ONE
// ensureBrandCollection call. Returning the shared in-flight promise (rather
// than awaiting and caching the resolved value) closes the read-through race
// where both callers miss the cache and both create the collection. (WB-014)
function getBrandCollectionId(ctx: ApplyContext, brand: string): Promise<string> {
  let p = ctx.brandCollectionCache.get(brand)
  if (!p) {
    p = ensureBrandCollection(ctx.container, brand)
    // Don't poison the cache on a transient failure: drop the entry on
    // rejection so a later same-brand group can retry. The returned promise
    // still rejects, so the awaiting group is recorded in `errors`.
    p.catch(() => ctx.brandCollectionCache.delete(brand))
    ctx.brandCollectionCache.set(brand, p)
  }
  return p
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
      "status",
      "metadata",
      "variants.id",
      "variants.sku",
      "variants.metadata",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { external_id: [externalId] },
  })
  return data?.[0] ?? null
}

/**
 * Persist vendor_product_current rows for a group whose Medusa product already
 * exists (adopted on retry, or re-listed after a prior discontinue). Upsert by
 * (vendor_code, part_number) so a partial re-adopt is itself idempotent.
 *
 * Findings 2/3: distinguishes a "prior partial apply" (product already
 * published, some/all variants already exist — just heal the current rows)
 * from a "re-list" (product was drafted + metadata.discontinued_at set when
 * the group was previously discontinued — republish + clear the flag + refresh
 * the variants that survived). Either way, any staging SKU that still has no
 * resolvable variant after attempting to create it is a hard error: we never
 * persist a `medusa_variant_id: null` row (that zombie wedges every future
 * diff/apply for the part_number).
 */
async function persistAdoptedGroup(
  ctx: ApplyContext,
  group: NewGroup,
  records: NormalizedRecord[],
  existingProduct: any
): Promise<void> {
  const productType: "wheel" | "tire" =
    records[0]?.productType === "tire" ? "tire" : "wheel"

  // 1. Dedupe like the create path so dropped duplicates never get a row (F3).
  const deduped: NormalizedRecord[] =
    productType === "wheel"
      ? dedupeExactDuplicates(records as WheelNormalizedRecord[]).survivors
      : (dedupeTireExactDuplicates(records as TireNormalizedRecord[])
          .survivors as NormalizedRecord[])

  // 2. Re-list detection (F2): the product was drafted when discontinued.
  //    Detection only here — the republish itself is deferred to step 5 so it
  //    can act as the commit marker (see below).
  const relisted =
    existingProduct.status === "draft" ||
    (existingProduct.metadata as any)?.discontinued_at != null

  // 3. Create any variant that does not yet exist on the product (F3). This
  //    also covers a plain (non-relisted) partial-apply heal on a PUBLISHED
  //    product: addVariantsToProduct's create + option-extend workflows never
  //    emit product.updated, so healed variants must be recorded here or
  //    Meilisearch keeps stale price_min/max + facets (finding 1, mirrors the
  //    fix already applied to applyChangedGroup).
  let skuIndex = indexVariantsBySku(existingProduct.variants ?? [])
  const missing = deduped.filter((r) => !skuIndex.get(r.partNumber)?.variantId)
  if (missing.length > 0) {
    skuIndex = await addVariantsToProduct(
      ctx,
      existingProduct.id,
      missing,
      productType
    )
    ctx.touchedProductIds.add(existingProduct.id)
  }

  // 4. Refresh the variants that already existed when re-listing (F2/F4).
  //    Runs BEFORE the republish (step 5) while the product is still "draft" —
  //    variants are freely updatable on a draft product, so this ordering is
  //    safe and lets step 5 be the sole commit marker.
  if (relisted) {
    const missingSet = new Set(missing.map((r) => r.partNumber))
    const existed = deduped.filter((r) => !missingSet.has(r.partNumber))
    await refreshReListedVariants(ctx, existingProduct.id, existed)
  }

  // 5. Republish LAST (F2): this is the commit marker for the whole re-list.
  //    If steps 3/4 throw, the product is left "draft" with discontinued_at
  //    still set, so a retry re-derives relisted=true and re-runs create +
  //    refresh — nothing is silently skipped on partial failure.
  if (relisted) {
    const meta = { ...((existingProduct.metadata as any) ?? {}) }
    delete meta.discontinued_at
    await updateProductsWorkflow(ctx.container).run({
      input: {
        selector: { id: existingProduct.id },
        update: { status: "published" as any, metadata: meta },
      },
    })
    ctx.touchedProductIds.add(existingProduct.id)
  }

  // 6. Persist current rows with REAL variant ids + unsettled hash. Never write
  //    a null-variant row (F3): a truly unresolvable SKU throws so the group is
  //    recorded partially_failed and retried.
  for (const r of deduped) {
    const info = skuIndex.get(r.partNumber)
    if (!info?.variantId) {
      throw new Error(
        `adopt: could not resolve or create a variant for ${r.partNumber} (group ${group.group_key})`
      )
    }
    const fields = {
      group_key: r.groupKey,
      content_hash: "", // settled by the stock pass on success (F5)
      medusa_product_id: existingProduct.id,
      medusa_variant_id: info.variantId,
      inventory_item_id: info.inventoryItemId ?? null,
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
      content_hash: "", // unsettled; the stock pass settles on success (F5)
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
      content_hash: "", // unsettled; settled by the stock pass (F5)
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
 * Findings 2/4: a previously-removed variant the vendor re-lists is adopted
 * onto an existing product. Clear its discontinued flags and refresh price +
 * metadata so it is neither hidden nor stale. Explicit discontinued:false /
 * discontinued_at:null defends against Medusa metadata-merge semantics.
 * (product.updated is emitted separately by applyChanges.)
 */
async function refreshReListedVariants(
  ctx: ApplyContext,
  productId: string,
  records: NormalizedRecord[]
): Promise<void> {
  if (records.length === 0) return
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku"],
    filters: { product_id: [productId] },
  })
  const idBySku = new Map<string, string>()
  for (const v of variants ?? []) {
    if ((v as any).sku) idBySku.set((v as any).sku, (v as any).id)
  }

  const updates = records
    .map((r) => {
      const id = idBySku.get(r.partNumber)
      if (!id) return null
      return {
        id,
        allow_backorder: false,
        metadata: {
          ...buildVariantMetadata(r),
          discontinued: false,
          discontinued_at: null,
        },
        prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
        ...wheelVariantWeight(r),
      }
    })
    .filter((u): u is NonNullable<typeof u> => u !== null)

  if (updates.length > 0) {
    await updateProductVariantsWorkflow(ctx.container).run({
      input: { product_variants: updates },
    })
  }
}

/**
 * Create the given records as NEW variants on an existing product and return a
 * SKU -> {variantId, inventoryItemId} index over the product's full variant set
 * afterwards. Used by adoption (finding 3) to heal a product that exists but is
 * missing variants, instead of persisting a null-variant current row.
 */
async function addVariantsToProduct(
  ctx: ApplyContext,
  productId: string,
  records: NormalizedRecord[],
  productType: "wheel" | "tire"
): Promise<Map<string, { variantId: string; inventoryItemId: string | null }>> {
  if (records.length > 0) {
    if (productType === "wheel") {
      const wheels = records as WheelNormalizedRecord[]
      await extendWheelOptions(ctx, productId, wheels)
      await createProductVariantsWorkflow(ctx.container).run({
        input: {
          product_variants: wheels.map((r) => ({
            product_id: productId,
            ...buildWheelVariantInput(r),
          })),
        },
      })
    } else {
      const tires = records as TireNormalizedRecord[]
      await extendTireOptions(ctx, productId, tires)
      await createProductVariantsWorkflow(ctx.container).run({
        input: {
          product_variants: tires.map((r) => ({
            product_id: productId,
            title: tireSizeLabelForVariantTitle(r),
            sku: r.partNumber,
            options: buildTireVariantOptions(r),
            manage_inventory: true,
            allow_backorder: false,
            metadata: buildVariantMetadata(r),
            prices: [{ amount: r.msrpUsd, currency_code: "usd" }],
          })),
        },
      })
    }
  }

  // Re-query the product's variants (with inventory item ids) to index by SKU.
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku", "inventory_items.inventory_item_id"],
    filters: { product_id: [productId] },
  })
  return indexVariantsBySku(variants ?? [])
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

/**
 * Extend the tire product's single "Size" option to include any new size label
 * introduced by added rows. createProductVariantsWorkflow only accepts option
 * values that already exist on the product.
 */
async function extendTireOptions(
  ctx: ApplyContext,
  productId: string,
  addedRecords: TireNormalizedRecord[]
): Promise<void> {
  const query = ctx.container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "options.id", "options.title", "options.values.value"],
    filters: { id: [productId] },
  })
  const sizeOption = (products?.[0] as any)?.options?.find(
    (o: any) => o.title === TIRE_OPTION_TITLES.SIZE
  )
  if (!sizeOption) return
  const existing = new Set<string>(
    (sizeOption.values ?? []).map((v: any) => v.value)
  )
  const merged = new Set(existing)
  for (const r of addedRecords) merged.add(buildTireVariantOptions(r).Size)
  if (merged.size === existing.size) return
  await updateProductOptionsWorkflow(ctx.container).run({
    input: {
      selector: { id: sizeOption.id },
      update: { values: [...merged] },
    },
  })
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
