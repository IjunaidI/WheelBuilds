"use server"

import { subscribeNewsletter } from "@lib/data/newsletter"

export async function newsletterSubscribe(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const clean = email.trim()
  if (!clean) return { ok: false, error: "Enter an email address" }
  try {
    await subscribeNewsletter(clean)
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't subscribe — try again" }
  }
}
