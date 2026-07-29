"use server"

import {
  postSupportRequest,
  type SupportRequestBody,
} from "@lib/data/support-request"

/**
 * WB-119. Mirrors `modules/home/actions.ts`'s `newsletterSubscribe`.
 *
 * ⚠️ A "use server" module may export ONLY async functions. Neither vitest
 * nor tsc catches a violation — only `next build` does, which is how this
 * broke in WB-093. Do not add a constant, type, or sync helper export here;
 * the `SupportRequestBody` type is imported from the data layer rather than
 * re-exported for exactly that reason.
 *
 * Returns a plain `{ ok, error? }` rather than throwing: Next.js redacts
 * thrown Server Action messages in production, so a throw would surface to
 * the customer as an opaque failure (the same lesson as WB-092 C9).
 */
export async function submitSupportRequest(
  input: SupportRequestBody
): Promise<{ ok: boolean; error?: string }> {
  const name = input.name?.trim() ?? ""
  const email = input.email?.trim() ?? ""
  const message = input.message?.trim() ?? ""

  if (!name) return { ok: false, error: "Enter your name" }
  if (!email) return { ok: false, error: "Enter an email address" }
  if (!message) return { ok: false, error: "Enter a message" }

  try {
    await postSupportRequest({ ...input, name, email, message })
    return { ok: true }
  } catch {
    return { ok: false, error: "Couldn't send that — please try again" }
  }
}
