import { HttpTypes } from "@medusajs/types"

/**
 * The manual (user-entered) promo codes to send back to the cart. Pass
 * removeCode to exclude exactly one (remove path); omit it to retain all manual
 * codes (add path, before pushing the new code). Automatic promotions
 * (code == null) are filtered OUT — Medusa re-derives them — so they are never
 * echoed back. Fixes the inverted `=== undefined` filter that wiped all codes. (WB-036)
 */
export function retainedPromoCodes(
  promotions: HttpTypes.StorePromotion[],
  removeCode?: string
): string[] {
  return promotions
    .filter((p) => p.code != null && p.code !== removeCode)
    .map((p) => p.code as string)
}
