/**
 * Turns a snake_case Medusa status ("partially_shipped") into a readable
 * label ("Partially shipped"). WB-093 A4: this function was already correct
 * but dead -- both call sites in `./index.tsx` were commented out, so the
 * order/payment status spans rendered empty. Re-enabling those calls is the
 * fix; this file just makes the pure piece independently testable.
 */
export function formatStatus(status: string): string {
  const formatted = status.split("_").join(" ")
  return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
}
