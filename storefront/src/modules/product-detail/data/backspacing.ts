/**
 * Backspacing (WB-098 Task 1) — a plain (non-`"use server"`) module because
 * this is a synchronous pure function: every export of a `"use server"` file
 * must be async, so a sync helper there fails `next build` (vitest/tsc are
 * blind to that rule — only the real build catches it).
 *
 * Standard wheel backspacing formula, in inches:
 *   backspacing = (widthIn / 2) + 0.5 + (offsetMm / 25.4)
 * The `+0.5` accounts for the two half-inch bead-seat lips (marketing width
 * vs mounting width). Verify vectors: 9" wide × +15mm offset -> 5.59";
 * 8" wide × -12mm offset -> 4.03".
 */
export function deriveBackspacing(
  widthIn: number | null | undefined,
  offsetMm: number | null | undefined
): string {
  if (
    typeof widthIn !== "number" ||
    !Number.isFinite(widthIn) ||
    typeof offsetMm !== "number" ||
    !Number.isFinite(offsetMm)
  ) {
    return ""
  }
  const backspacing = widthIn / 2 + 0.5 + offsetMm / 25.4
  return `${backspacing.toFixed(2)}"`
}
