import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { isRealStyleName } from "../modules/vendor-sync/pipeline/wheel-grouping"

/**
 * One-time backfill (WB-087): `buildGroupTitle` now appends the vendor Style
 * column to the title when it's a real human model name (e.g. "Petrol NOMAD
 * 058") rather than a bare code (e.g. "Performance Replicas 126" stays as-is
 * for style "PR126"). That change only affects products created (or
 * re-grouped) AFTER it shipped — this script brings existing wheel products
 * in line by recomputing their title from product metadata with the exact
 * same rule and updating in place when it differs.
 *
 * Handle is untouched (buildGroupHandle does not use style) — this script
 * never touches `handle`, only `title`.
 *
 * Idempotent: recomputing the same title for an already-correct product is
 * a no-op, so re-running the script after a partial run (or after it's
 * already fully applied) updates nothing further.
 *
 * Run: pnpm exec medusa exec ./src/scripts/retitle-wheels.ts
 */
export default async function retitleWheels({ container }: ExecArgs) {
  const productModule = container.resolve(Modules.PRODUCT)
  const logger = container.resolve("logger")

  const pageSize = 200
  let offset = 0
  let scanned = 0
  let updated = 0
  let skippedNoDisplayStyleNo = 0

  for (;;) {
    // NOTE: metadata is a JSONB blob with more keys than just product_type
    // (brand, group_key, style, ...), so a partial `metadata: {...}` filter
    // would require an exact whole-object match and never hit — filter for
    // wheels in application code instead, over ALL products, paged.
    const [products] = await productModule.listAndCountProducts(
      {},
      { select: ["id", "title", "metadata"], take: pageSize, skip: offset }
    )
    if (products.length === 0) break

    const updates: { id: string; title: string }[] = []

    for (const p of products) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      if (meta.product_type !== "wheel") continue
      scanned++

      const displayStyleNo =
        typeof meta.display_style_no === "string" && meta.display_style_no.trim()
          ? meta.display_style_no
          : null
      if (!displayStyleNo) {
        // Per-SKU fallback products (no DisplayStyleNo) keep their
        // CSV-PartDescription title — buildGroupTitle never touches them.
        skippedNoDisplayStyleNo++
        continue
      }

      const brand = typeof meta.brand === "string" ? meta.brand : ""
      const style = typeof meta.style === "string" ? meta.style : null

      const newTitle = isRealStyleName(style, displayStyleNo)
        ? [brand, style!.trim(), displayStyleNo].join(" ")
        : [brand, displayStyleNo].join(" ")

      if (newTitle !== p.title) {
        updates.push({ id: p.id, title: newTitle })
      }
    }

    if (updates.length > 0) {
      await updateProductsWorkflow(container).run({
        input: { products: updates },
      })
      updated += updates.length
      logger.info(
        `[retitle-wheels] updated ${updates.length} title(s) in this page (running total ${updated})`
      )
    }

    offset += pageSize
  }

  logger.info(
    `[retitle-wheels] done — scanned=${scanned} wheel product(s), updated=${updated}, skipped (no display_style_no)=${skippedNoDisplayStyleNo}`
  )
}
