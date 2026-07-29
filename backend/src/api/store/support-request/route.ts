import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ulid } from "ulid"

import { isValidEmail, normalizeEmail } from "../../../lib/email-address"
import { SUPPORT_REQUEST_MODULE } from "../../../modules/support-request"
import { parseSupportRequest } from "./validators"

/**
 * WB-119 Q-04 / Q-20 — persist-then-notify.
 *
 * The row is written BEFORE any notification is attempted, and the response
 * does not depend on a notification succeeding. That ordering is the whole
 * point of this endpoint: transactional email cannot be sent at all right now
 * (no sending domain — see docs/reference/client-input-needed.md item 6), so
 * a submission that only sent an email would be lost forever. Storing first
 * means every lead survives, and delivery becomes a best-effort side effect
 * that can be switched on later with no code change here.
 *
 * Until then, submissions are read straight from the database — the query is
 * in the go-live runbook.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const parsed = parseSupportRequest(req.body)
  if (parsed.ok === false) {
    res.status(400).json({ error: "invalid_request", details: parsed.error })
    return
  }

  const email = normalizeEmail(parsed.data.email)
  if (!isValidEmail(email)) {
    res.status(400).json({ error: "invalid_email" })
    return
  }

  const svc = req.scope.resolve(SUPPORT_REQUEST_MODULE) as any

  const created = await svc.createSupportRequests({
    id: `supreq_${ulid()}`,
    name: parsed.data.name,
    email,
    message: parsed.data.message,
    phone: parsed.data.phone ?? null,
    subject: parsed.data.subject ?? null,
    source: parsed.data.source ?? null,
    vehicle: parsed.data.vehicle ?? null,
    product_handle: parsed.data.product_handle ?? null,
    country_code: parsed.data.country_code ?? null,
  })

  // The message is durable from here on. Anything below is best-effort and
  // must never turn a stored request into a client-visible failure.
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const id = Array.isArray(created) ? created[0]?.id : created?.id
  logger.info(
    `[support-request] stored ${id} (source=${parsed.data.source ?? "contact"})`
  )

  res.status(201).json({ received: true })
}
