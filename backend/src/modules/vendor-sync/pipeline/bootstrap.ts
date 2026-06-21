import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createProductCategoriesWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Ensures a US region with USD exists. Returns regionId.
 * Idempotent -- if a region named "United States" already exists, returns its id.
 */
export async function ensureUsRegion(
  container: MedusaContainer
): Promise<string> {
  const regionService = container.resolve(Modules.REGION)
  const existing = await regionService.listRegions({ name: "United States" })
  if (existing.length > 0) {
    return existing[0].id
  }

  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "United States",
          currency_code: "usd",
          countries: ["us"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  })
  return result[0].id
}

/**
 * Ensures the "Default Sales Channel" exists. Returns salesChannelId.
 */
export async function ensureDefaultSalesChannel(
  container: MedusaContainer
): Promise<string> {
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const existing = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (existing.length > 0) {
    return existing[0].id
  }

  const { result } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        {
          name: "Default Sales Channel",
        },
      ],
    },
  })
  return result[0].id
}

/**
 * Ensures "Wheels" and "Tires" product categories exist.
 * Returns { wheelsCategoryId, tiresCategoryId }.
 */
export async function ensureProductCategories(
  container: MedusaContainer
): Promise<{ wheelsCategoryId: string; tiresCategoryId: string }> {
  const productService = container.resolve(Modules.PRODUCT)

  // Check for existing categories
  const existingWheels = await productService.listProductCategories({
    name: "Wheels",
  })
  const existingTires = await productService.listProductCategories({
    name: "Tires",
  })

  let wheelsCategoryId: string
  let tiresCategoryId: string

  if (existingWheels.length > 0) {
    wheelsCategoryId = existingWheels[0].id
  } else {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [{ name: "Wheels", is_active: true }],
      },
    })
    wheelsCategoryId = result[0].id
  }

  if (existingTires.length > 0) {
    tiresCategoryId = existingTires[0].id
  } else {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [{ name: "Tires", is_active: true }],
      },
    })
    tiresCategoryId = result[0].id
  }

  return { wheelsCategoryId, tiresCategoryId }
}

/**
 * Ensures a product collection for the given brand name exists.
 * Returns collectionId.
 * Uses metadata.vendor_sync_brand=true to identify managed collections.
 */
export async function ensureBrandCollection(
  container: MedusaContainer,
  brand: string
): Promise<string> {
  const productService = container.resolve(Modules.PRODUCT)

  // Search by title (Medusa 2.0 collections use "title" not "name")
  const existing = await productService.listProductCollections({
    title: brand,
  })
  if (existing.length > 0) {
    return existing[0].id
  }

  const [created] = await productService.createProductCollections([
    {
      title: brand,
      metadata: { vendor_sync_brand: "true" },
    },
  ])
  return created.id
}

/**
 * Ensures a default shipping profile exists. Returns shippingProfileId.
 */
export async function ensureShippingProfile(
  container: MedusaContainer
): Promise<string> {
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)
  const existing = await fulfillmentService.listShippingProfiles({
    type: "default",
  })
  if (existing.length > 0) {
    return existing[0].id
  }

  const { result } = await createShippingProfilesWorkflow(container).run({
    input: {
      data: [
        {
          name: "Default Shipping Profile",
          type: "default",
        },
      ],
    },
  })
  return result[0].id
}

/**
 * Ensures a stock location exists for the given warehouse code.
 * Creates "Warehouse <code>" with metadata.vendor_warehouse_code = code.
 * Links to the default sales channel.
 * Returns stock_location_id.
 * Caches results in-memory for the run (same warehouse code = same location).
 */
export async function ensureStockLocation(
  container: MedusaContainer,
  warehouseCode: string,
  salesChannelId: string,
  cache: Map<string, string>
): Promise<string> {
  const cached = cache.get(warehouseCode)
  if (cached) return cached

  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
  // Medusa's FilterableStockLocationProps type omits `metadata`, but the service
  // accepts a metadata filter at runtime — cast to satisfy the type.
  const existing = await stockLocationService.listStockLocations({
    metadata: { vendor_warehouse_code: warehouseCode },
  } as any)

  if (existing.length > 0) {
    cache.set(warehouseCode, existing[0].id)
    return existing[0].id
  }

  const { result } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: `Warehouse ${warehouseCode}`,
          metadata: { vendor_warehouse_code: warehouseCode },
        },
      ],
    },
  })
  const locationId = result[0].id

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: locationId,
      add: [salesChannelId],
    },
  })

  cache.set(warehouseCode, locationId)
  return locationId
}
