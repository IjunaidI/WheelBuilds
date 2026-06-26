import { sdk } from "@lib/config"

export const subscribeNewsletter = (email: string) =>
  sdk.client.fetch<{ subscribed: boolean }>("/store/newsletter", {
    method: "POST",
    body: { email },
  })
