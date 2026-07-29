import { z } from "zod"

/**
 * WB-119. Mirrors `api/store/newsletter/validators.ts`.
 *
 * The length caps are deliberate: this endpoint is public and
 * unauthenticated, so an unbounded `message` is a free write-amplification
 * vector into the database. 5,000 characters is far more than a fitment
 * question needs.
 *
 * `.trim()` runs before the min-length checks, so a whitespace-only name or
 * message is rejected rather than stored as an empty string.
 */
const SupportRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().min(3).max(254),
  message: z.string().trim().min(1).max(5000),
  phone: z.string().trim().max(50).nullish(),
  subject: z.string().trim().max(200).nullish(),
  source: z.string().trim().max(50).nullish(),
  vehicle: z.string().trim().max(200).nullish(),
  product_handle: z.string().trim().max(200).nullish(),
  country_code: z.string().trim().max(10).nullish(),
})

export type SupportRequestInput = z.infer<typeof SupportRequestSchema>

export type ParseResult =
  | { ok: true; data: SupportRequestInput }
  | { ok: false; error: string }

export function parseSupportRequest(body: unknown): ParseResult {
  const r = SupportRequestSchema.safeParse(body)
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    }
  }
  return { ok: true, data: r.data }
}
