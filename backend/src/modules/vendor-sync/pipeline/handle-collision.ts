import { createHash } from "node:crypto"

/**
 * Deterministic 6-hex-char suffix from a group_key, for disambiguating a
 * colliding product handle (WB-089 L10). Same group_key → same suffix every
 * run, so a suffixed handle is stable across re-applies.
 */
export function handleSuffix(groupKey: string): string {
  return createHash("sha1").update(groupKey).digest("hex").slice(0, 6)
}

/** The collision-disambiguated handle for a group. */
export function suffixedHandle(baseHandle: string, groupKey: string): string {
  return `${baseHandle}-${handleSuffix(groupKey)}`
}

/** Does this create error look like a product-handle uniqueness violation? */
export function isHandleConflictError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "").toLowerCase()
  const code = String((err as any)?.code ?? "")
  return (
    code === "23505" ||
    (msg.includes("handle") &&
      (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")))
  )
}
