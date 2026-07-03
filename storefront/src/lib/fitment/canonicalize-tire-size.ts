/**
 * Canonicalize a tire size for the fitment join — twin of the backend
 * wheel-size/canonicalize-tire-size.ts, guarded by the shared golden
 * fixtures/tire-size-canonical-golden.json. Pure.
 */
export function canonicalizeTireSize(s: string): string {
  const token = (s ?? "").trim().split(/\s+/)[0] ?? ""
  if (!token) return ""
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}
