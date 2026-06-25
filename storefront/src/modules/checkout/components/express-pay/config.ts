/**
 * Checkout provider feature flags (WB-035). Default OFF. These enable the UI
 * only — a real provider (Stripe wallets / Affirm) must be wired separately.
 * Deliberately NOT gated on the Stripe key, so enabling Stripe CARD payments
 * does not surface non-functional WALLET buttons.
 */

/** Apple/Google wallet express pay is wired. */
export const isExpressPayEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_EXPRESS_PAY_ENABLED === "true"

/** Affirm BNPL messaging is wired. */
export const isAffirmEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_AFFIRM_ENABLED === "true"
