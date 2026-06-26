import { z } from "zod"

const NewsletterSubscribeSchema = z.object({
  email: z.string().min(1),
  country_code: z.string().nullish(),
  source: z.string().nullish(),
})

export type NewsletterSubscribeInput = z.infer<typeof NewsletterSubscribeSchema>

export type ParseResult =
  | { ok: true; data: NewsletterSubscribeInput }
  | { ok: false; error: string }

export function parseNewsletterSubscribe(body: unknown): ParseResult {
  const r = NewsletterSubscribeSchema.safeParse(body)
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  return { ok: true, data: r.data }
}
