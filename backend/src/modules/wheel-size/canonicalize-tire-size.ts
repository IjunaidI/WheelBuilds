/**
 * Canonicalize a tire size string for the fitment join. Uppercase, strip a
 * trailing service description, and remove the "Z" speed modifier so
 * "255/35ZR19" == "255/35R19". Mirrors the vendor-sync canonical size output
 * (SP1) so the vehicle side matches the indexed `tire_sizes`. Pure.
 */
export function canonicalizeTireSize(s: string): string {
  const token = (s ?? "").trim().split(/\s+/)[0] ?? ""
  if (!token) return ""
  return token.toUpperCase().replace(/Z(?=[RBD]\d)/g, "")
}
