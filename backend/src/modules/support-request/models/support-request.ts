import { model } from "@medusajs/framework/utils"

/**
 * A customer message from the contact form or a PDP fitment-check CTA
 * (WB-119 Q-04 / Q-20).
 *
 * Deliberately NOT unique on anything. The newsletter module's entity has a
 * partial unique index on email because a subscription is SET membership and
 * a duplicate POST must be a no-op. A support request is the opposite: a
 * second message from the same person is a second message, and de-duplicating
 * it would silently discard a customer's words.
 *
 * `notified_at` exists so that, once a sending domain is available, a
 * notifier can tell which stored requests still need an email without
 * re-sending the ones already delivered. It stays null until then — see
 * docs/reference/client-input-needed.md item 6.
 */
const SupportRequest = model
  .define("support_request", {
    id: model.id().primaryKey(),
    name: model.text(),
    email: model.text(),
    phone: model.text().nullable(),
    subject: model.text().nullable(),
    message: model.text(),
    /** "contact" | "fitment-check" — which surface it came from. */
    source: model.text().nullable(),
    /** Free-text vehicle context, prefilled by the fitment CTA. */
    vehicle: model.text().nullable(),
    /** Product handle the shopper was looking at, when known. */
    product_handle: model.text().nullable(),
    country_code: model.text().nullable(),
    /** Set once a notification has actually been delivered. */
    notified_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["created_at"] }, { on: ["email"] }])

export default SupportRequest
