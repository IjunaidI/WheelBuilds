const PASSWORD_MIN_LENGTH = 8

/**
 * Storefront-side password length rule (WB-093 A9). `@medusajs/auth-emailpass`
 * (verified 2.13.6) does NOT enforce a minimum length itself, so a 1-character
 * password is otherwise accepted end to end. Returns an error string when the
 * password is too short, or `null` when it satisfies the rule.
 */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }

  return null
}
