import { HttpTypes } from "@medusajs/types"
import { num } from "../group-sizes"
import { buildTireSizeOptions } from "./tire-size-options"
import { classifyTireType } from "./classify-tire-type"
import type { TireProductDetail } from "../types"

/** Map a tire Medusa product → TireProductDetail. Pure over the fetched product. */
export function mapTireDetail(product: HttpTypes.StoreProduct): TireProductDetail {
  const pmeta = (product.metadata ?? {}) as Record<string, unknown>
  const variants = product.variants ?? []
  const rep = (variants[0]?.metadata ?? {}) as Record<string, unknown>

  const sizeOptions = buildTireSizeOptions(variants as any[])
  const rimDiameters = Array.from(new Set(sizeOptions.map((s) => s.rimDiameterIn))).sort((a, b) => a - b)
  const prices = sizeOptions.map((s) => s.priceCents).filter((n) => n > 0)
  const priceCents = prices.length ? Math.min(...prices) : 0
  const weightLb = Math.round((num((product as any).weight) / 453.592) * 10) / 10
  const tireType = classifyTireType(
    typeof pmeta.tire_prefix === "string" ? pmeta.tire_prefix : null,
    rep
  )

  return {
    kind: "tire",
    id: product.id!,
    handle: product.handle!,
    brand: String(pmeta.brand ?? ""),
    name: product.title ?? "",
    description: product.description ?? "",
    thumbnail: product.thumbnail ?? null,
    priceCents,
    tireType,
    rimDiameters,
    sizeOptions,
    specs: {
      construction:
        (typeof pmeta.construction === "string" && pmeta.construction) ||
        (typeof rep.construction_type === "string" && rep.construction_type) ||
        null,
      plyRating: (typeof rep.ply_rating === "string" && rep.ply_rating) || null,
      tireType,
      weightLb,
    },
    fitment: [], // default; getProductDetail overrides via reverse tire fitment (WB-065)
  }
}
