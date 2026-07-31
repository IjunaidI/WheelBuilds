/**
 * The copy for the PDP's "we are hiding some options" banner (WB-124).
 *
 * Two filters can be active independently or together — fitment (`?fit=1`,
 * WB-060) and in-stock (`?in_stock=1`, WB-124). The banner is a claim about
 * what the shopper is being shown, so it lives in a pure, tested function
 * rather than being assembled inline: getting it wrong means telling someone
 * their options are filtered by their car when they are not, or vice versa.
 */

export type FilterNotice = {
  /** Sentence describing what is hidden. */
  message: string
  /** Label for the escape control. */
  action: string
}

export function filterNotice(opts: {
  fitActive: boolean
  stockActive: boolean
  vehicleLabel?: string | null
}): FilterNotice | null {
  const { fitActive, stockActive, vehicleLabel } = opts
  if (!fitActive && !stockActive) return null

  // Never say "your car" without naming it — an unnamed vehicle reads as a
  // guess, and the shopper cannot tell which car we mean.
  const car = vehicleLabel?.trim() ? `your ${vehicleLabel.trim()}` : "your vehicle"

  if (fitActive && stockActive) {
    return {
      message: `Showing only sizes that fit ${car} and are in stock.`,
      action: "Show all sizes",
    }
  }
  if (stockActive) {
    return {
      message: "Showing only sizes that are in stock.",
      action: "Show all sizes",
    }
  }
  return {
    message: `Showing only sizes that fit ${car}.`,
    action: "Show all sizes",
  }
}
