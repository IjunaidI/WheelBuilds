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
