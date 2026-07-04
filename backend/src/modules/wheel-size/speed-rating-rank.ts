// Standard tire speed-rating order (ascending km/h). H is deliberately between U
// and V (H=210, U=200, V=240). The rank IS the 0-based index. Z/ZR (>240) map to
// W's index so a fast tire is never wrongly excluded; parens are stripped so
// "(Y)" ranks as Y; unknown/missing → -1 (the meet-or-exceed gate then passes
// whenever the OEM speed is also unknown, and never falsely excludes).
const ORDER = ["L", "M", "N", "P", "Q", "R", "S", "T", "U", "H", "V", "W", "Y"]

export function speedRatingRank(rating: string | null | undefined): number {
  if (!rating) return -1
  const r = rating.toUpperCase().replace(/[()]/g, "").trim()
  if (r === "Z" || r === "ZR") return ORDER.indexOf("W")
  return ORDER.indexOf(r) // -1 when not a known rating
}
