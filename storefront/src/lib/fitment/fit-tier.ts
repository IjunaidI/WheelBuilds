// WB-077: the three-tier fitment verdict, threaded through every fit surface.
// fits  — bolt ∩ AND bore clears AND ≥1 variant fully in-window
// check — bolt ∩ AND bore clears, but no variant is fully in-window (aggressive; verify clearance)
// no-fit — physical impossibility: bolt mismatch, or bore genuinely below hub beyond tolerance
// unknown — vehicle has no pattern data OR product has no pattern data
export type FitTier = "fits" | "check" | "no-fit" | "unknown"
