/**
 * Escape a value for a Meilisearch filter string literal (WB-088 D12).
 * Backslashes MUST be escaped before quotes — escaping quotes first and
 * then backslashes would double-escape the backslashes just inserted in
 * front of each quote, corrupting the literal for any value that already
 * contains a `\`.
 */
export const lit = (v: string | number): string =>
  typeof v === "number"
    ? String(v)
    : `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
