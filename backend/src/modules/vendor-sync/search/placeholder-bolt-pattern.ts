/**
 * Vendor placeholders that must never index as a bolt-pattern facet value
 * (WB-089 L9). Mirrors the storefront twin in
 * storefront/src/modules/product-detail/data/group-sizes.ts.
 */
const PLACEHOLDER_BOLT_PATTERNS = new Set(["", "blank", "n/a", "na", "call"])

export function isRealBoltPattern(raw: unknown): boolean {
  return !PLACEHOLDER_BOLT_PATTERNS.has(String(raw ?? "").trim().toLowerCase())
}
