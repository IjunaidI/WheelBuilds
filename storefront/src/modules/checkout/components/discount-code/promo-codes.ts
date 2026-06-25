import { HttpTypes } from "@medusajs/types"

/**
 * The manual (user-entered) promo codes to send back to the cart. Pass
 * removeCode to exclude exactly one (remove path); omit it to retain all manual
 * codes (add path, before pushing the new code). Automatic promotions are
 * filtered OUT (Medusa re-derives them) — detected by `is_automatic` (the same
 * signal the UI's remove button gates on) OR a null code, so an automatic promo
 * that carries a code is never echoed back. Fixes the inverted `=== undefined`
 * filter that wiped all codes. (WB-036)
 */
export function retainedPromoCodes(
  promotions: HttpTypes.StorePromotion[],
  removeCode?: string
): string[] {
  return promotions
    .filter((p) => !p.is_automatic && p.code != null && p.code !== removeCode)
    .map((p) => p.code as string)
}
