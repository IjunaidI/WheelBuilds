import { MedusaService } from "@medusajs/framework/utils"
import SupportRequest from "./models/support-request"

/**
 * WB-119. A plain `MedusaService` — deliberately no custom upsert.
 *
 * The newsletter module needs an atomic idempotent upsert because a
 * subscription is SET membership and a duplicate POST must be a no-op. A
 * support request is the opposite: every submission is a distinct message
 * that must be kept, so the generated `createSupportRequests` is exactly
 * right, and adding cleverness here would risk losing a customer's message.
 */
class SupportRequestService extends MedusaService({ SupportRequest }) {}

export default SupportRequestService
