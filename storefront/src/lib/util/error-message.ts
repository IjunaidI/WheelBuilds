/**
 * Shared message extraction for Medusa/axios-style errors (WB-079 F15 dedup).
 * `medusaError` (throws) and `cart.ts`'s `errText` (returns) both derive their
 * user-facing copy from `error.response.data`, which may be a string, an object
 * with `.message`, or an arbitrary object — never assume `.charAt` (that throws
 * a masking TypeError). Returns the capitalized, period-terminated message, or
 * `null` when there is no response data or the message is empty.
 */
export function extractMedusaMessage(error: any): string | null {
  const data = error?.response?.data
  if (data == null) return null
  const raw = data?.message ?? data
  const message =
    typeof raw === "string" ? raw : raw?.message ?? JSON.stringify(raw)
  if (typeof message !== "string" || message.length === 0) return null
  return message.charAt(0).toUpperCase() + message.slice(1) + "."
}

/**
 * Detects a Medusa insufficient-inventory error and turns it into an exact,
 * actionable message instead of the generic transient-failure copy (WB-090
 * P2/P18) — a permanent condition ("not enough stock") reading like a
 * transient one ("try again in a moment") is itself the bug this fixes.
 *
 * Accepts either a raw axios/Medusa-shaped error (unwrapped via
 * `extractMedusaMessage`) or an already-extracted message string — the shape
 * `addToCart` returns, since Next.js redacts thrown Server Action error
 * messages in production (WB-079 B2), so the real message has to cross the
 * client/server boundary as plain string data, not as a thrown Error.
 *
 * Returns null when the message doesn't look inventory-related (or there is
 * no message at all), so the caller falls back to its own generic copy.
 */
export function insufficientStockMessage(
  err: unknown,
  available: number
): string | null {
  const message = typeof err === "string" ? err : extractMedusaMessage(err)
  if (!message) return null
  const lower = message.toLowerCase()
  const looksInsufficient =
    lower.includes("inventory") ||
    lower.includes("stock") ||
    lower.includes("not enough")
  if (!looksInsufficient) return null
  return `Only ${available} in stock — reduce quantity`
}
