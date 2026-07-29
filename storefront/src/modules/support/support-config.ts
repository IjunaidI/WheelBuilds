/**
 * Support channels shown on /contact (WB-119 Q-04).
 *
 * Each renders ONLY when its env var is set. A fake support address is worse
 * than none — it silently swallows customer mail — so there is deliberately
 * no default and no placeholder. Both values are pending from the client
 * (docs/reference/client-input-needed.md item 4), which means "unset" is the
 * CURRENT production state, not a hypothetical.
 *
 * `NEXT_PUBLIC_SUPPORT_EMAIL` predates this file (WB-081, already read
 * directly by the contact page); `NEXT_PUBLIC_SUPPORT_PHONE` is new. Both are
 * `NEXT_PUBLIC_*`, so they are inlined at BUILD time — setting them in the
 * host without rebuilding the storefront changes nothing.
 */
export type SupportChannels = {
  email: string | null
  phone: string | null
  /** True when at least one channel can be shown. */
  hasAny: boolean
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim()
  return t.length ? t : null
}

/**
 * Pure core, exported for tests — vitest cannot restub a value Next has
 * already inlined, so the env read is kept out of the testable unit.
 */
export function supportChannelsFrom(
  email: string | undefined,
  phone: string | undefined
): SupportChannels {
  const e = clean(email)
  const p = clean(phone)
  return { email: e, phone: p, hasAny: Boolean(e || p) }
}

export function supportChannels(): SupportChannels {
  // Must be literal `process.env.NEXT_PUBLIC_*` member expressions — that is
  // how Next.js inlines them at build time.
  return supportChannelsFrom(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    process.env.NEXT_PUBLIC_SUPPORT_PHONE
  )
}
