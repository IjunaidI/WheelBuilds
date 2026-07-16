import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { getRegion } from "./regions"

export const getProductsById = cache(async function ({
  ids,
  regionId,
}: {
  ids: string[]
  regionId: string
}) {
  return sdk.store.product
    .list(
      {
        id: ids,
        region_id: regionId,
        // +variants.metadata is load-bearing (WB-077 I2): enrichLineItems (in
        // ./cart.ts) OVERWRITES each cart/order line item's `variant` with the
        // variant returned here, so the checkout + order-confirmation
        // FitmentVerifiedCard reads its fitment facets (bolt_pattern_raw,
        // center_bore_mm, wheel_diameter_in/width_in, offset_mm) from THIS
        // variant.metadata. Additive `+` — widens, never narrows the field set.
        fields: "*variants.calculated_price,+variants.inventory_quantity,+variants.metadata",
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products }) => products)
})

export const getProductByHandle = cache(async function (
  handle: string,
  regionId: string
) {
  return sdk.store.product
    .list(
      {
        handle,
        region_id: regionId,
        // +metadata is load-bearing: the PDP loader branches on
        // product.metadata.product_type ("wheel" | "tire"), and Medusa's Store API
        // omits product metadata unless it's named — without it EVERY tire renders
        // through the wheel template (blank image + zeroed specs), and the wheel
        // PDP's own brand/construction/warranty (also read from metadata) come back empty.
        // +variants.weight (WB-090 P8/L6) is also load-bearing: without it every
        // variant's own shipping weight comes back undefined and
        // groupVariantsIntoSizes falls back to the single product-level +weight
        // for every size, so all sizes show the same weight.
        // +variants.sku (WB-098 Task 3) is the same class: Medusa's Store API
        // drops the plain scalar `sku` column unless it's explicitly named, so
        // without it every variant's real vendor part number comes back
        // undefined and the PDP has nothing to surface/copy or feed into the
        // Product JSON-LD.
        fields:
          "*variants.calculated_price,+variants.inventory_quantity,+collection_id,+weight,+variants.weight,+variants.sku,+metadata",
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products }) => products[0])
})

export const getProductsList = cache(async function ({
  pageParam = 1,
  queryParams,
  countryCode,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  const limit = queryParams?.limit || 12
  const validPageParam = Math.max(pageParam, 1);
  const offset = (validPageParam - 1) * limit
  const region = await getRegion(countryCode)

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }
  return sdk.store.product
    .list(
      {
        limit,
        offset,
        region_id: region.id,
        fields: "*variants.calculated_price",
        ...queryParams,
      },
      { next: { tags: ["products"] } }
    )
    .then(({ products, count }) => {
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products,
          count,
        },
        nextPage: nextPage,
        queryParams,
      }
    })
})
