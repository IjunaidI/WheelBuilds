//
// Pure status logic for the vendor-sync admin console. No React / no Medusa
// imports so it unit-tests under jest (the React surface in page.tsx is gated by
// `medusa build`). Mirrors the guards in the existing /admin/vendor-sync routes:
//   - cancel route accepts: awaiting_approval, applying, staging, diffing, fetching
//   - replay route accepts: completed, failed
//   - approve route accepts: awaiting_approval

export type RunAction = "approve" | "cancel" | "replay"

const IN_FLIGHT = ["fetching", "staging", "diffing", "applying"]

export function actionsForStatus(status: string): RunAction[] {
  if (status === "awaiting_approval") return ["approve", "cancel"]
  if (IN_FLIGHT.includes(status)) return ["cancel"]
  if (status === "completed" || status === "failed") return ["replay"]
  return []
}

export function badgeForStatus(
  status: string
): "green" | "orange" | "red" | "blue" | "grey" {
  if (status === "completed") return "green"
  if (status === "awaiting_approval" || status === "partially_failed") return "orange"
  if (status === "failed" || status === "exhausted") return "red"
  if (IN_FLIGHT.includes(status)) return "blue"
  return "grey" // cancelled + anything unknown
}

/** A run that can still change without operator action (so the list should poll). */
export function isNonTerminal(status: string): boolean {
  return status === "awaiting_approval" || IN_FLIGHT.includes(status)
}
