import { MedusaService } from "@medusajs/framework/utils"
import NewsletterSubscription from "./models/newsletter-subscription"

class NewsletterService extends MedusaService({ NewsletterSubscription }) {
  /**
   * Idempotent subscribe keyed on the (already-normalized) email. Existing →
   * { created: false }; new → inserts and returns { created: true }. Callers
   * normalize via normalizeEmail before calling.
   */
  async subscribe(
    email: string,
    meta?: { country_code?: string | null; source?: string | null }
  ): Promise<{ created: boolean }> {
    const existing = await this.listNewsletterSubscriptions({ email })
    if (existing[0]) return { created: false }
    await this.createNewsletterSubscriptions({
      email,
      country_code: meta?.country_code ?? null,
      source: meta?.source ?? null,
    })
    return { created: true }
  }
}

export default NewsletterService
