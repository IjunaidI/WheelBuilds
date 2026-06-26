import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { NEWSLETTER_MODULE } from "../../../modules/newsletter"
import { normalizeEmail, isValidEmail } from "../../../modules/newsletter/lib/email"
import { parseNewsletterSubscribe } from "./validators"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const parsed = parseNewsletterSubscribe(req.body)
  if (parsed.ok === false) {
    res.status(400).json({ error: "invalid_email", details: parsed.error })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  if (!isValidEmail(email)) { res.status(400).json({ error: "invalid_email" }); return }

  const svc = req.scope.resolve(NEWSLETTER_MODULE) as any
  await svc.subscribe(email, {
    country_code: parsed.data.country_code ?? null,
    source: parsed.data.source ?? null,
  })
  res.status(201).json({ subscribed: true })
}
