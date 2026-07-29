import { sdk } from "@lib/config"

export type SupportRequestBody = {
  name: string
  email: string
  message: string
  phone?: string | null
  subject?: string | null
  /** "contact" | "fitment-check" — which surface it came from. */
  source?: string | null
  vehicle?: string | null
  product_handle?: string | null
  country_code?: string | null
}

/** WB-119. Mirrors `lib/data/newsletter.ts`. */
export const postSupportRequest = (body: SupportRequestBody) =>
  sdk.client.fetch<{ received: boolean }>("/store/support-request", {
    method: "POST",
    body,
  })
