import { model } from "@medusajs/framework/utils"

const NewsletterSubscription = model.define("newsletter_subscription", {
  id: model.id().primaryKey(),
  email: model.text(),
  country_code: model.text().nullable(),
  source: model.text().nullable(),
}).indexes([
  { on: ["email"], unique: true },
])

export default NewsletterSubscription
