type VariantOptionLike = {
  value?: string | null
}

type VariantLike = {
  options?: VariantOptionLike[] | null
  title?: string | null
}

/**
 * Joins a variant's option VALUES (e.g. "Bronze · 20 x 9") for cart/mini-cart
 * line display — mirrors checkout-summary's
 * `item.variant?.options?.map(o => o.value).join(" · ")`.
 *
 * Before this (WB-092 C7), the line rendered `variant.title` instead, which
 * for wheel variants carries no finish — a Bronze buyer's cart line and
 * mini-cart looked identical to a Black buyer's. Falls back to `title` only
 * when the variant has no option values at all, so products with a single
 * "Size" option (e.g. the seed Sweatshirt/Sweatpants, whose title IS the
 * size) keep rendering exactly as before.
 */
export function variantOptionsLabel(variant: VariantLike | undefined): string {
  const values = variant?.options
    ?.map((o) => o.value)
    .filter((v): v is string => Boolean(v))

  if (values && values.length > 0) {
    return values.join(" · ")
  }

  return variant?.title ?? ""
}
