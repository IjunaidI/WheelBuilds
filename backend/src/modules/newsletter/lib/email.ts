/**
 * Re-export of the shared helpers in `src/lib/email-address.ts` (WB-119
 * Task 1). Kept as a module-local path so the newsletter module's existing
 * imports and tests are untouched.
 */
export { normalizeEmail, isValidEmail } from "../../../lib/email-address"
