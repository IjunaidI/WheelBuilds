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
  // "not enough" was dropped (WB-090 fixwave) — it false-positives on
  // non-stock errors. These three cover Medusa v2's real insufficient-
  // inventory strings ("does not have the required inventory",
  // "Insufficient stock").
  const looksInsufficient =
    lower.includes("inventory") ||
    lower.includes("insufficient") ||
    lower.includes("in stock")
  if (!looksInsufficient) return null
  return `Only ${available} in stock — reduce quantity`
}

/**
 * Classifies a thrown SDK error as "the resource genuinely doesn't exist"
 * (404) vs. everything else (5xx, network failure, malformed request, etc).
 *
 * This is the discriminant `retrieveCart` (WB-092 C3a) and `retrieveOrder`
 * (WB-092 C8) need: a 404 is the expected "no active cart" / "bad order id"
 * case and should degrade to `null` so the caller's empty-state /
 * `notFound()` branch renders. Anything else is an outage and must be
 * rethrown — collapsing both into the same `null` is exactly the bug this
 * fixes (a backend 5xx used to render "you don't have anything in your
 * cart" to a customer who actually has one).
 *
 * Checks both error shapes seen in this codebase: the real
 * `@medusajs/js-sdk` `FetchError` (a bare `.status` number) and the
 * axios-style shape `medusaError` already expects (`.response.status`), so
 * it's safe to use regardless of which client threw. A network failure
 * (fetch itself rejects — no response, no status at all) falls through to
 * `false`, i.e. "not a 404" — correctly triggering the rethrow path.
 */
export function isNotFoundError(error: any): boolean {
  const status = error?.status ?? error?.response?.status
  return status === 404
}
